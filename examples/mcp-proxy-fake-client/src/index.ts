import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStdioUpstreamClient,
  McpProxy,
  HttpEnforraCloudClient,
  type EnforraCloudClient,
  type EnforraDecision,
  type EnforraDecisionRequest,
  type EnforraDecisionResult,
  type McpProxyLogEvent,
  type RegisterCapabilitiesRequest
} from "@enforra/mcp";

class FakeCloud implements EnforraCloudClient {
  private readonly registrations: RegisterCapabilitiesRequest[] = [];

  getRegistrations(): RegisterCapabilitiesRequest[] {
    return this.registrations;
  }

  private readonly decisions: Record<string, EnforraDecision> = {
    "files.read": "log_only",
    "terminal.run": "require_approval",
    "secrets.read": "block"
  };

  async registerCapabilities(payload: RegisterCapabilitiesRequest): Promise<void> {
    this.registrations.push(payload);
  }

  async decide(payload: EnforraDecisionRequest): Promise<EnforraDecisionResult> {
    return {
      decision: this.decisions[payload.toolName] ?? "block",
      reason: `demo policy for ${payload.toolName}`,
      runtimeEventId: `demo-event-${payload.toolName}`
    };
  }
}

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const fakeServerPath = resolve(repoRoot, "examples/mcp-proxy-fake-server/dist/index.js");

const useRealCloud = process.env.ENFORRA_USE_REAL_CLOUD === "true";
const apiKeyValue = process.env.ENFORRA_API_KEY;
const apiUrlValue = process.env.ENFORRA_API_URL || "https://api-staging.enforra.com";
const agentKey = process.env.ENFORRA_AGENT_KEY || "openclaw-agent";
const agentName = process.env.ENFORRA_AGENT_NAME || "OpenClaw Workspace Agent";
const environment = process.env.ENFORRA_ENVIRONMENT || "demo";
const capPath = process.env.ENFORRA_CAPABILITIES_REGISTER_PATH || "/v1/agent-capabilities/register";
const demoRunId = process.env.ENFORRA_DEMO_RUN_ID ?? `mcp-proxy-demo-${Date.now()}`;

console.log(`ENFORRA_API_URL: ${apiUrlValue}`);
console.log(`ENFORRA_AGENT_KEY: ${agentKey}`);
console.log(`ENFORRA_ENVIRONMENT: ${environment}`);
console.log(`Capability registration URL: ${apiUrlValue}${capPath}`);
console.log(`Decision URL: ${apiUrlValue}/v1/decide\n`);

let cloud: EnforraCloudClient;
if (useRealCloud) {
  if (!apiKeyValue || apiKeyValue.trim() === "") {
    throw new Error("Missing required env var ENFORRA_API_KEY for real Enforra Cloud mode");
  }
  cloud = new HttpEnforraCloudClient({
    apiUrl: apiUrlValue,
    apiKey: apiKeyValue,
    capabilityRegistrationPath: capPath
  });
} else {
  if (apiKeyValue && apiKeyValue.trim() !== "") {
    console.log("Using mock cloud. Set ENFORRA_USE_REAL_CLOUD=true to use real Enforra Cloud.\n");
  }
  cloud = new FakeCloud();
}

const events: McpProxyLogEvent[] = [];
const upstream = createStdioUpstreamClient({
  transport: "stdio",
  command: "node",
  args: [fakeServerPath],
  env: {}
});

const proxy = new McpProxy({
  upstream,
  cloud,
  agent: {
    key: agentKey,
    name: agentName,
    purpose: "Developer workspace agent",
    environment: environment
  },
  logger: (event) => events.push(event),
  demoRunId
});

try {
  const listResponse = await proxy.handleRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  });

  if (listResponse && "error" in listResponse && listResponse.error) {
    throw new Error(`MCP tools/list failed: ${listResponse.error.message}`);
  }

  const discoveredTools = extractToolNames(listResponse?.result);

  console.log("Discovered MCP tools:");
  for (const toolName of discoveredTools) {
    console.log(`* ${toolName}`);
  }
  console.log("");

  console.log("Registered capabilities with Enforra:");
  const getRegistrations = (cloud as { getRegistrations?: () => RegisterCapabilitiesRequest[] })
    .getRegistrations;
  if (typeof getRegistrations === "function") {
    const regs = getRegistrations.call(cloud);
    for (const registration of regs) {
      for (const tool of registration.tools) {
        console.log(`* ${tool.name} source=${tool.source}`);
      }
    }
  } else {
    for (const toolName of discoveredTools) {
      console.log(`* ${toolName} source=mcp (registered with real Enforra Cloud)`);
    }
  }
  console.log("");

  await runTool("files.read", { path: "demo.txt" });
  await runTool("terminal.run", { command: "echo demo" });
  await runTool("secrets.read", { key: "demo" });
} finally {
  upstream.close();
}

async function runTool(toolName: string, args: Record<string, unknown>): Promise<void> {
  const response = await proxy.handleRequest({
    jsonrpc: "2.0",
    id: toolName,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  });

  if (response && "error" in response && response.error) {
    throw new Error(`Tool call ${toolName} failed: ${response.error.message}`);
  }

  const event = events[events.length - 1];
  if (event === undefined) {
    throw new Error(`No proxy event recorded for ${toolName}`);
  }

  console.log(`Agent requested MCP tool: ${toolName}`);
  console.log(`Decision from Enforra: ${event.decision}`);
  if (event.runtimeEventId) {
    console.log(`Runtime event id: ${event.runtimeEventId}`);
  } else {
    console.log("Runtime event id: not returned");
  }
  console.log(`Demo run id: ${proxy.demoRunId}`);
  console.log(`Forwarded to upstream: ${String(event.forwardedToUpstream)}`);
  console.log(`handlerExecuted: ${String(event.handlerExecuted)}`);
  console.log("");
}

function extractToolNames(result: unknown): string[] {
  if (!isRecord(result) || !Array.isArray(result["tools"])) {
    return [];
  }

  return result["tools"]
    .filter(isRecord)
    .map((tool) => tool["name"])
    .filter((name): name is string => typeof name === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
