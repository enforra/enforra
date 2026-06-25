import { spawn, type ChildProcessByStdio } from "node:child_process";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";

type JsonObject = Record<string, unknown>;
type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JsonObject;
}

export interface EnforraMcpCapability {
  name: string;
  tool_name: string;
  displayName: string;
  display_name: string;
  description: string;
  inputSchema: JsonObject;
  input_schema: JsonObject;
  source: "mcp";
  environment: string;
  dataTouched: string[];
  data_touched: string[];
  sideEffect: string;
  side_effect: string;
}

export interface EnforraAgentMetadata {
  key: string;
  name: string;
  purpose: string;
  environment: string;
}

export interface RegisterCapabilitiesRequest {
  agent: EnforraAgentMetadata;
  source: "mcp";
  tools: EnforraMcpCapability[];
}

export type EnforraDecision = "allow" | "log_only" | "block" | "require_approval";

export interface EnforraDecisionRequest {
  agentKey: string;
  toolName: string;
  args: unknown;
  context: {
    environment: string;
    agent: {
      key: string;
      name: string;
    };
    source: "mcp_proxy";
    demoRunId?: string;
  };
}

export interface EnforraDecisionResult {
  decision: EnforraDecision;
  reason?: string;
  runtimeEventId?: string;
}

export interface EnforraCloudClient {
  registerCapabilities(payload: RegisterCapabilitiesRequest): Promise<void>;
  decide(payload: EnforraDecisionRequest): Promise<EnforraDecisionResult>;
}

export interface McpUpstreamClient {
  request(method: string, params?: unknown): Promise<unknown>;
  notify?(method: string, params?: unknown): void;
  close?(): void;
}

export interface McpProxyConfig {
  apiUrl: string;
  apiKey: string;
  agentKey: string;
  agentName: string;
  agentPurpose: string;
  environment: string;
  upstreamConfigPath: string;
  capabilitiesRegisterPath: string;
  demoRunId?: string;
}

export interface StdioUpstreamConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpProxyLogEvent {
  toolName: string;
  decision: EnforraDecision;
  reason?: string;
  runtimeEventId?: string;
  handlerExecuted: boolean;
  forwardedToUpstream: boolean;
}

export interface CreateMcpProxyOptions {
  upstream: McpUpstreamClient;
  cloud: EnforraCloudClient;
  agent: EnforraAgentMetadata;
  logger?: (event: McpProxyLogEvent) => void;
  demoRunId?: string;
}

const DEFAULT_API_URL = "https://api-staging.enforra.com";
const DEFAULT_ENVIRONMENT = "demo";
const DEFAULT_AGENT_KEY = "mcp-agent";
const DEFAULT_AGENT_NAME = "MCP Workspace Agent";
const DEFAULT_AGENT_PURPOSE = "Developer workspace agent";
const DEFAULT_CAPABILITIES_REGISTER_PATH = "/v1/agent-capabilities/register";

export function printMcpProxyMetadata(config: {
  apiUrl: string;
  agentKey: string;
  environment: string;
  capabilitiesRegisterPath: string;
}): void {
  process.stderr.write(`ENFORRA_API_URL: ${config.apiUrl}\n`);
  process.stderr.write(`ENFORRA_AGENT_KEY: ${config.agentKey}\n`);
  process.stderr.write(`ENFORRA_ENVIRONMENT: ${config.environment}\n`);
  process.stderr.write(
    `Capability registration URL: ${config.apiUrl}${config.capabilitiesRegisterPath}\n`
  );
  process.stderr.write(`Decision URL: ${config.apiUrl}/v1/decide\n`);
}

export function loadMcpProxyConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): McpProxyConfig & { demoRunId: string } {
  const apiKey = env["ENFORRA_API_KEY"];
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error("Missing required env var ENFORRA_API_KEY for Enforra MCP proxy");
  }

  const upstreamConfigPath = env["ENFORRA_MCP_UPSTREAM_CONFIG"];
  if (upstreamConfigPath === undefined || upstreamConfigPath.trim() === "") {
    throw new Error("Missing required env var ENFORRA_MCP_UPSTREAM_CONFIG for Enforra MCP proxy");
  }

  const apiUrl = trimTrailingSlash(env["ENFORRA_API_URL"] ?? DEFAULT_API_URL);
  const agentKey = env["ENFORRA_AGENT_KEY"] ?? DEFAULT_AGENT_KEY;
  const environment = env["ENFORRA_ENVIRONMENT"] ?? DEFAULT_ENVIRONMENT;
  const capabilitiesRegisterPath =
    env["ENFORRA_CAPABILITIES_REGISTER_PATH"] ?? DEFAULT_CAPABILITIES_REGISTER_PATH;

  const demoRunId = env["ENFORRA_DEMO_RUN_ID"] ?? `mcp-proxy-demo-${Date.now()}`;

  const config = {
    apiUrl,
    apiKey,
    agentKey,
    agentName: env["ENFORRA_AGENT_NAME"] ?? DEFAULT_AGENT_NAME,
    agentPurpose: env["ENFORRA_AGENT_PURPOSE"] ?? DEFAULT_AGENT_PURPOSE,
    environment,
    upstreamConfigPath,
    capabilitiesRegisterPath,
    demoRunId
  };

  printMcpProxyMetadata(config);

  return config;
}

export async function loadStdioUpstreamConfig(path: string): Promise<StdioUpstreamConfig> {
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (!isRecord(parsed)) {
    throw new Error("Invalid ENFORRA_MCP_UPSTREAM_CONFIG: expected an object");
  }

  if (parsed["transport"] !== "stdio") {
    throw new Error("Invalid ENFORRA_MCP_UPSTREAM_CONFIG: v1 only supports stdio transport");
  }

  if (typeof parsed["command"] !== "string" || parsed["command"].trim() === "") {
    throw new Error("Invalid ENFORRA_MCP_UPSTREAM_CONFIG: command must be a non-empty string");
  }

  const args = parsed["args"];
  if (
    args !== undefined &&
    (!Array.isArray(args) || !args.every((item) => typeof item === "string"))
  ) {
    throw new Error("Invalid ENFORRA_MCP_UPSTREAM_CONFIG: args must be an array of strings");
  }

  const env = parsed["env"];
  if (env !== undefined && !isStringRecord(env)) {
    throw new Error("Invalid ENFORRA_MCP_UPSTREAM_CONFIG: env must be an object of string values");
  }

  return {
    transport: "stdio",
    command: parsed["command"],
    args: args ?? [],
    env: env ?? {}
  };
}

export class HttpEnforraCloudClient implements EnforraCloudClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly capabilityRegistrationPath: string;

  constructor(options: { apiUrl: string; apiKey: string; capabilityRegistrationPath?: string }) {
    this.apiUrl = trimTrailingSlash(options.apiUrl);
    this.apiKey = options.apiKey;
    this.capabilityRegistrationPath =
      options.capabilityRegistrationPath ?? DEFAULT_CAPABILITIES_REGISTER_PATH;
  }

  async registerCapabilities(payload: RegisterCapabilitiesRequest): Promise<void> {
    const isDebug = process.env["ENFORRA_DEBUG_CLOUD_RESPONSE"] === "true";

    if (isDebug) {
      const redacted = redactPayloadForDebug(payload);
      process.stderr.write(
        `[DEBUG] Capability registration request body: ${JSON.stringify(redacted, null, 2)}\n`
      );
    }

    const response = await fetch(`${this.apiUrl}${this.capabilityRegistrationPath}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload)
    });

    let responseText = "";
    try {
      responseText = await response.text();
    } catch {
      // ignore
    }

    if (isDebug) {
      process.stderr.write(
        `[DEBUG] Capability registration response status: ${response.status} ${response.statusText}\n`
      );
      process.stderr.write(`[DEBUG] Capability registration response body: ${responseText}\n`);
    }

    if (!response.ok) {
      let redactedBody = responseText;
      try {
        const parsed = JSON.parse(responseText);
        redactedBody = JSON.stringify(redactPayloadForDebug(parsed), null, 2);
      } catch {
        // ignore
      }
      throw new Error(
        `Capability registration failed: ${response.status} ${response.statusText}\nResponse body: ${redactedBody}`
      );
    }
  }

  async decide(payload: EnforraDecisionRequest): Promise<EnforraDecisionResult> {
    const isDebug =
      process.env["ENFORRA_DEBUG_CLOUD_RESPONSE"] === "true" ||
      process.env["ENFORRA_DEBUG_DECIDE_RESPONSE"] === "true";

    const mappedPayload = {
      agent_key: payload.agentKey,
      tool_name: payload.toolName,
      args_summary: payload.args,
      context: payload.context
    };

    if (process.env["ENFORRA_DEBUG_CLOUD_RESPONSE"] === "true") {
      const redacted = redactPayloadForDebug(mappedPayload);
      process.stderr.write(
        `[DEBUG] /v1/decide request body: ${JSON.stringify(redacted, null, 2)}\n`
      );
    }

    const response = await fetch(`${this.apiUrl}/v1/decide`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(mappedPayload)
    });

    let responseText = "";
    try {
      responseText = await response.text();
    } catch {
      // ignore
    }

    if (process.env["ENFORRA_DEBUG_CLOUD_RESPONSE"] === "true") {
      process.stderr.write(
        `[DEBUG] /v1/decide response status: ${response.status} ${response.statusText}\n`
      );
      process.stderr.write(`[DEBUG] /v1/decide response body: ${responseText}\n`);
    }

    if (!response.ok) {
      let redactedBody = responseText;
      try {
        const parsed = JSON.parse(responseText);
        redactedBody = JSON.stringify(redactPayloadForDebug(parsed), null, 2);
      } catch {
        // ignore
      }
      throw new Error(
        `Enforra /v1/decide failed: ${response.status} ${response.statusText}\nResponse body: ${redactedBody}`
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(responseText);
    } catch {
      throw new Error(`Failed to parse decide response JSON: ${responseText}`);
    }

    if (isDebug) {
      const redacted = redactPayloadForDebug(body);
      process.stderr.write(`[DEBUG] /v1/decide response: ${JSON.stringify(redacted, null, 2)}\n`);
    }

    return normalizeDecisionResponse(body);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }
}

export class McpProxy {
  private readonly upstream: McpUpstreamClient;
  private readonly cloud: EnforraCloudClient;
  private readonly agent: EnforraAgentMetadata;
  private readonly logger?: (event: McpProxyLogEvent) => void;
  private lastCapabilitySignature?: string;
  public readonly demoRunId: string;

  constructor(options: CreateMcpProxyOptions) {
    this.upstream = options.upstream;
    this.cloud = options.cloud;
    this.agent = options.agent;
    this.logger = options.logger;
    this.demoRunId = options.demoRunId ?? `mcp-proxy-demo-${Date.now()}`;
  }

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | undefined> {
    if (request.id === undefined) {
      this.forwardNotification(request);
      return undefined;
    }

    try {
      if (request.method === "tools/list") {
        const result = await this.handleToolsList(request.params);
        return createResultResponse(request.id, result);
      }

      if (request.method === "tools/call") {
        const result = await this.handleToolsCall(request.params);
        return createResultResponse(request.id, result);
      }

      const result = await this.upstream.request(request.method, request.params);
      return createResultResponse(request.id, result);
    } catch (error) {
      return createErrorResponse(request.id, normalizeErrorMessage(error));
    }
  }

  private async handleToolsList(params: unknown): Promise<unknown> {
    const upstreamResult = await this.upstream.request("tools/list", params);
    const tools = extractTools(upstreamResult);
    const capabilities = tools.map((tool) =>
      normalizeMcpToolCapability(tool, this.agent.environment)
    );
    const signature = JSON.stringify(capabilities);

    if (capabilities.length > 0 && signature !== this.lastCapabilitySignature) {
      await this.cloud.registerCapabilities({
        agent: this.agent,
        source: "mcp",
        tools: capabilities
      });
      this.lastCapabilitySignature = signature;
    }

    return upstreamResult;
  }

  private async handleToolsCall(params: unknown): Promise<unknown> {
    const call = parseToolCallParams(params);
    const argsWithRunId = injectDemoRunId(call.arguments, this.demoRunId);
    const decision = await this.cloud.decide({
      agentKey: this.agent.key,
      toolName: call.name,
      args: argsWithRunId,
      context: {
        environment: this.agent.environment,
        agent: {
          key: this.agent.key,
          name: this.agent.name
        },
        source: "mcp_proxy",
        demoRunId: this.demoRunId
      }
    });

    if (decision.decision === "allow" || decision.decision === "log_only") {
      const upstreamResult = await this.upstream.request("tools/call", params);
      this.log({
        toolName: call.name,
        decision: decision.decision,
        reason: decision.reason,
        runtimeEventId: decision.runtimeEventId,
        handlerExecuted: true,
        forwardedToUpstream: true
      });
      return upstreamResult;
    }

    this.log({
      toolName: call.name,
      decision: decision.decision,
      reason: decision.reason,
      runtimeEventId: decision.runtimeEventId,
      handlerExecuted: false,
      forwardedToUpstream: false
    });

    return createBlockedToolResult(decision);
  }

  private forwardNotification(request: JsonRpcRequest): void {
    if (this.upstream.notify) {
      this.upstream.notify(request.method, request.params);
    }
  }

  private log(event: McpProxyLogEvent): void {
    if (this.logger) {
      this.logger(event);
      return;
    }

    process.stderr.write(`${JSON.stringify(event)}\n`);
  }
}

export class StdioUpstreamClient implements McpUpstreamClient {
  private readonly child: ChildProcessByStdio<Writable, Readable, null>;
  private readonly endpoint: JsonRpcEndpoint;

  constructor(config: StdioUpstreamConfig) {
    this.child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "inherit"]
    });
    this.endpoint = new JsonRpcEndpoint(this.child.stdout, this.child.stdin);
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    return await this.endpoint.request(method, params);
  }

  notify(method: string, params?: unknown): void {
    this.endpoint.notify(method, params);
  }

  close(): void {
    this.child.kill();
  }
}

export class JsonRpcEndpoint extends EventEmitter {
  private readonly readable: NodeJS.ReadableStream;
  private readonly writable: NodeJS.WritableStream;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  onRequest?: (request: JsonRpcRequest) => Promise<JsonRpcResponse | undefined>;

  constructor(readable: NodeJS.ReadableStream, writable: NodeJS.WritableStream) {
    super();
    this.readable = readable;
    this.writable = writable;

    this.readable.on("data", (chunk: Buffer | string) => {
      this.buffer = Buffer.concat([
        this.buffer,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      ]);
      this.drainBuffer();
    });
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const message: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.writeMessage(message);
    });
  }

  notify(method: string, params?: unknown): void {
    this.writeMessage({ jsonrpc: "2.0", method, params });
  }

  writeResponse(response: JsonRpcResponse): void {
    this.writeMessage(response);
  }

  private drainBuffer(): void {
    while (this.buffer.length > 0) {
      const message = this.readNextMessage();
      if (message === undefined) {
        return;
      }
      void this.handleMessage(message);
    }
  }

  private readNextMessage(): unknown | undefined {
    const text = this.buffer.toString("utf8");
    const headerEnd = text.indexOf("\r\n\r\n");
    if (text.toLowerCase().startsWith("content-length:") && headerEnd < 0) {
      return undefined;
    }

    if (headerEnd >= 0 && text.slice(0, headerEnd).toLowerCase().includes("content-length:")) {
      const header = text.slice(0, headerEnd);
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (match === null) {
        throw new Error("Invalid JSON-RPC frame: missing Content-Length");
      }

      const bodyLength = Number(match[1]);
      const bodyStart = Buffer.byteLength(text.slice(0, headerEnd + 4));
      const frameLength = bodyStart + bodyLength;
      if (this.buffer.length < frameLength) {
        return undefined;
      }

      const body = this.buffer.subarray(bodyStart, frameLength).toString("utf8");
      this.buffer = this.buffer.subarray(frameLength);
      return JSON.parse(body);
    }

    const newline = text.indexOf("\n");
    if (newline < 0) {
      return undefined;
    }

    const line = text.slice(0, newline).trim();
    this.buffer = this.buffer.subarray(Buffer.byteLength(text.slice(0, newline + 1)));
    if (line === "") {
      return undefined;
    }
    return JSON.parse(line);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isRecord(message)) {
      return;
    }

    if (typeof message["method"] === "string") {
      await this.handleRequestMessage(message);
      return;
    }

    this.handleResponseMessage(message);
  }

  private async handleRequestMessage(message: JsonObject): Promise<void> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: message["method"] as string,
      params: message["params"],
      id: isJsonRpcId(message["id"]) ? message["id"] : undefined
    };

    if (!this.onRequest) {
      if (request.id !== undefined) {
        this.writeResponse(createErrorResponse(request.id, "Method not found", -32601));
      }
      return;
    }

    const response = await this.onRequest(request);
    if (response !== undefined) {
      this.writeResponse(response);
    }
  }

  private handleResponseMessage(message: JsonObject): void {
    const id = message["id"];
    if (!isJsonRpcId(id)) {
      return;
    }

    const pending = this.pending.get(id);
    if (pending === undefined) {
      return;
    }

    this.pending.delete(id);
    if (isRecord(message["error"])) {
      pending.reject(new Error(String(message["error"]["message"] ?? "JSON-RPC request failed")));
      return;
    }

    pending.resolve(message["result"]);
  }

  private writeMessage(message: unknown): void {
    const body = JSON.stringify(message);
    this.writable.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }
}

export async function serveMcpProxy(
  proxy: McpProxy,
  readable: NodeJS.ReadableStream = process.stdin,
  writable: NodeJS.WritableStream = process.stdout
): Promise<JsonRpcEndpoint> {
  const endpoint = new JsonRpcEndpoint(readable, writable);
  endpoint.onRequest = async (request) => await proxy.handleRequest(request);
  return endpoint;
}

export function normalizeMcpToolCapability(
  tool: McpToolDefinition,
  environment: string
): EnforraMcpCapability {
  const inference = inferMcpCapability(tool);

  return {
    name: tool.name,
    tool_name: tool.name,
    displayName: tool.title ?? readableToolName(tool.name),
    display_name: tool.title ?? readableToolName(tool.name),
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? {},
    input_schema: tool.inputSchema ?? {},
    source: "mcp",
    environment,
    dataTouched: inference.dataTouched,
    data_touched: inference.dataTouched,
    sideEffect: inference.sideEffect,
    side_effect: inference.sideEffect
  };
}

export function inferMcpCapability(tool: Pick<McpToolDefinition, "name" | "description">): {
  dataTouched: string[];
  sideEffect: string;
} {
  const text = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
  const dataTouched = new Set<string>();
  const sideEffects: string[] = [];

  if (containsAny(text, ["read", "get", "list", "search", "file"])) {
    dataTouched.add("workspace data");
    sideEffects.push("read");
  }

  if (containsAny(text, ["secret", "token", "key", "env", "credential"])) {
    dataTouched.add("credentials");
    sideEffects.push("sensitive read");
  }

  if (containsAny(text, ["terminal", "shell", "command", "run", "exec"])) {
    dataTouched.add("local environment");
    sideEffects.push("command_execution");
  }

  if (containsAny(text, ["write", "update", "create", "delete", "deploy", "send", "refund"])) {
    sideEffects.push("external_or_destructive_action");
  }

  return {
    dataTouched: dataTouched.size > 0 ? [...dataTouched] : ["unknown"],
    sideEffect: mostSignificantSideEffect(sideEffects)
  };
}

export function createStdioUpstreamClient(config: StdioUpstreamConfig): StdioUpstreamClient {
  return new StdioUpstreamClient(config);
}

export function createHttpEnforraCloudClient(config: McpProxyConfig): HttpEnforraCloudClient {
  return new HttpEnforraCloudClient({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    capabilityRegistrationPath: config.capabilitiesRegisterPath
  });
}

export async function createMcpProxyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Promise<{ proxy: McpProxy; upstream: StdioUpstreamClient }> {
  const config = loadMcpProxyConfigFromEnv(env);
  const upstreamConfig = await loadStdioUpstreamConfig(config.upstreamConfigPath);
  const upstream = createStdioUpstreamClient(upstreamConfig);
  const cloud = createHttpEnforraCloudClient(config);
  const proxy = new McpProxy({
    upstream,
    cloud,
    agent: {
      key: config.agentKey,
      name: config.agentName,
      purpose: config.agentPurpose,
      environment: config.environment
    },
    demoRunId: config.demoRunId
  });

  return { proxy, upstream };
}

function extractTools(result: unknown): McpToolDefinition[] {
  if (!isRecord(result) || !Array.isArray(result["tools"])) {
    return [];
  }

  return result["tools"].filter(isMcpToolDefinition);
}

function isMcpToolDefinition(value: unknown): value is McpToolDefinition {
  return (
    isRecord(value) &&
    typeof value["name"] === "string" &&
    (value["title"] === undefined || typeof value["title"] === "string") &&
    (value["description"] === undefined || typeof value["description"] === "string") &&
    (value["inputSchema"] === undefined || isRecord(value["inputSchema"]))
  );
}

function parseToolCallParams(params: unknown): { name: string; arguments: unknown } {
  if (!isRecord(params) || typeof params["name"] !== "string" || params["name"].trim() === "") {
    throw new Error("Invalid MCP tools/call params: name must be a non-empty string");
  }

  return {
    name: params["name"],
    arguments: params["arguments"] ?? {}
  };
}

function createBlockedToolResult(decision: EnforraDecisionResult): JsonObject {
  const title =
    decision.decision === "block" ? "Blocked by Enforra" : "Approval required by Enforra";
  const payload: JsonObject = {
    error: title,
    decision: decision.decision,
    reason: decision.reason ?? ""
  };

  if (decision.runtimeEventId !== undefined) {
    payload["runtimeEventId"] = decision.runtimeEventId;
  }

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload)
      }
    ]
  };
}

function normalizeDecisionResponse(body: unknown): EnforraDecisionResult {
  const candidates = [body];
  if (isRecord(body)) {
    candidates.push(body["data"], body["result"]);
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const decision = candidate["decision"];
    if (isEnforraDecision(decision)) {
      return {
        decision,
        reason:
          typeof candidate["reason"] === "string"
            ? candidate["reason"]
            : typeof candidate["message"] === "string"
              ? candidate["message"]
              : undefined,
        runtimeEventId: findRuntimeEventId(candidate)
      };
    }
  }

  throw new Error("Enforra /v1/decide response did not include a valid decision");
}

function findRuntimeEventId(value: JsonObject): string | undefined {
  const keys = ["runtimeEventId", "runtime_event_id", "eventId", "event_id", "id"];
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }
  return undefined;
}

function isEnforraDecision(value: unknown): value is EnforraDecision {
  return (
    value === "allow" || value === "log_only" || value === "block" || value === "require_approval"
  );
}

function createResultResponse(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function createErrorResponse(id: JsonRpcId, message: string, code = -32603): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

function readableToolName(name: string): string {
  return name
    .split(/[._-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mostSignificantSideEffect(sideEffects: string[]): string {
  if (sideEffects.includes("external_or_destructive_action")) {
    return "external_or_destructive_action";
  }
  if (sideEffects.includes("command_execution")) {
    return "command_execution";
  }
  if (sideEffects.includes("sensitive read")) {
    return "sensitive read";
  }
  if (sideEffects.includes("read")) {
    return "read";
  }
  return "unknown";
}

function containsAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "string");
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || typeof value === "number";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function injectDemoRunId(args: unknown, demoRunId: string): unknown {
  if (typeof args === "object" && args !== null && !Array.isArray(args)) {
    return {
      _demoRunId: demoRunId,
      ...args
    };
  }
  return args;
}

function redactPayloadForDebug(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactPayloadForDebug);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const sensitiveKeys = [
      "password",
      "passwd",
      "pwd",
      "token",
      "auth_token",
      "secret",
      "client_secret",
      "api_key",
      "apikey",
      "authorization",
      "access_token",
      "refresh_token",
      "private_key",
      "connection_string"
    ];
    for (const key of Object.keys(obj)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactPayloadForDebug(obj[key]);
      }
    }
    return result;
  }
  return value;
}
