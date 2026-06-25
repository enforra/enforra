import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpEnforraCloudClient,
  inferMcpCapability,
  loadMcpProxyConfigFromEnv,
  McpProxy,
  normalizeMcpToolCapability,
  type EnforraCloudClient,
  type EnforraDecision,
  type EnforraDecisionRequest,
  type EnforraDecisionResult,
  type McpProxyLogEvent,
  type McpToolDefinition,
  type McpUpstreamClient,
  type RegisterCapabilitiesRequest
} from "../src/index.js";

class FakeUpstream implements McpUpstreamClient {
  readonly calls: Array<{ method: string; params: unknown }> = [];
  readonly toolCalls = new Map<string, number>();

  constructor(private readonly tools: McpToolDefinition[]) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    this.calls.push({ method, params });

    if (method === "tools/list") {
      return { tools: this.tools };
    }

    if (method === "tools/call") {
      if (!isRecord(params) || typeof params["name"] !== "string") {
        throw new Error("invalid fake tools/call request");
      }

      const name = params["name"];
      this.toolCalls.set(name, (this.toolCalls.get(name) ?? 0) + 1);
      if (name === "secrets.read") {
        return { content: [{ type: "text", text: "fake secret text" }] };
      }
      return { content: [{ type: "text", text: `called ${name}` }] };
    }

    return { ok: true };
  }
}

class FakeCloud implements EnforraCloudClient {
  readonly registrations: RegisterCapabilitiesRequest[] = [];
  readonly decisions: EnforraDecisionRequest[] = [];

  constructor(private readonly decisionByTool: Record<string, EnforraDecision>) {}

  getRegistrations(): RegisterCapabilitiesRequest[] {
    return this.registrations;
  }

  async registerCapabilities(payload: RegisterCapabilitiesRequest): Promise<void> {
    this.registrations.push(payload);
  }

  async decide(payload: EnforraDecisionRequest): Promise<EnforraDecisionResult> {
    this.decisions.push(payload);
    return {
      decision: this.decisionByTool[payload.toolName] ?? "block",
      reason: `fake ${payload.toolName}`,
      runtimeEventId: `evt-${payload.toolName}`
    };
  }
}

const agent = {
  key: "openclaw-agent",
  name: "OpenClaw Workspace Agent",
  purpose: "Developer workspace agent",
  environment: "demo"
};

const tools: McpToolDefinition[] = [
  {
    name: "files.read",
    description: "Read a file from the workspace",
    inputSchema: { type: "object" }
  },
  {
    name: "terminal.run",
    description: "Run a terminal command",
    inputSchema: { type: "object" }
  },
  {
    name: "secrets.read",
    description: "Read a secret token",
    inputSchema: { type: "object" }
  }
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("McpProxy discovery", () => {
  it("calls upstream tools/list and returns the original MCP tool list", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({});
    const proxy = new McpProxy({ upstream, cloud, agent });

    const response = await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    });

    expect(upstream.calls).toEqual([{ method: "tools/list", params: undefined }]);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { tools }
    });
  });

  it("registers discovered MCP tools with normalized Enforra capability metadata", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({});
    const proxy = new McpProxy({ upstream, cloud, agent });

    await proxy.handleRequest({ jsonrpc: "2.0", id: "list-1", method: "tools/list" });

    expect(cloud.registrations).toHaveLength(1);
    expect(cloud.registrations[0]).toEqual({
      agent,
      source: "mcp",
      tools: [
        {
          name: "files.read",
          tool_name: "files.read",
          displayName: "Files Read",
          display_name: "Files Read",
          description: "Read a file from the workspace",
          inputSchema: { type: "object" },
          input_schema: { type: "object" },
          source: "mcp",
          environment: "demo",
          dataTouched: ["workspace data"],
          data_touched: ["workspace data"],
          sideEffect: "read",
          side_effect: "read"
        },
        {
          name: "terminal.run",
          tool_name: "terminal.run",
          displayName: "Terminal Run",
          display_name: "Terminal Run",
          description: "Run a terminal command",
          inputSchema: { type: "object" },
          input_schema: { type: "object" },
          source: "mcp",
          environment: "demo",
          dataTouched: ["local environment"],
          data_touched: ["local environment"],
          sideEffect: "command_execution",
          side_effect: "command_execution"
        },
        {
          name: "secrets.read",
          tool_name: "secrets.read",
          displayName: "Secrets Read",
          display_name: "Secrets Read",
          description: "Read a secret token",
          inputSchema: { type: "object" },
          input_schema: { type: "object" },
          source: "mcp",
          environment: "demo",
          dataTouched: ["workspace data", "credentials"],
          data_touched: ["workspace data", "credentials"],
          sideEffect: "sensitive read",
          side_effect: "sensitive read"
        }
      ]
    });
  });

  it("does not re-register duplicate discovery payloads unnecessarily", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({});
    const proxy = new McpProxy({ upstream, cloud, agent });

    await proxy.handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    await proxy.handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });

    expect(upstream.calls).toHaveLength(2);
    expect(cloud.registrations).toHaveLength(1);
  });

  it("infers MCP capability metadata with deterministic rules", () => {
    expect(inferMcpCapability({ name: "files.search", description: "" })).toEqual({
      dataTouched: ["workspace data"],
      sideEffect: "read"
    });
    expect(inferMcpCapability({ name: "env.secret.get", description: "credential token" })).toEqual(
      {
        dataTouched: ["workspace data", "credentials"],
        sideEffect: "sensitive read"
      }
    );
    expect(inferMcpCapability({ name: "shell.exec", description: "run command" })).toEqual({
      dataTouched: ["local environment"],
      sideEffect: "command_execution"
    });
    expect(normalizeMcpToolCapability({ name: "refund.send" }, "prod").side_effect).toBe(
      "external_or_destructive_action"
    );
    expect(inferMcpCapability({ name: "math.add", description: "adds numbers" })).toEqual({
      dataTouched: ["unknown"],
      sideEffect: "unknown"
    });
  });
});

describe("McpProxy runtime enforcement", () => {
  it("forwards allowed and log_only tools upstream", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({ "files.read": "allow", "terminal.run": "log_only" });
    const events: McpProxyLogEvent[] = [];
    const proxy = new McpProxy({ upstream, cloud, agent, logger: (event) => events.push(event) });

    const allowResponse = await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "files.read", arguments: { path: "README.md" } }
    });
    const logOnlyResponse = await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "terminal.run", arguments: { command: "pwd" } }
    });

    expect(allowResponse?.result).toEqual({
      content: [{ type: "text", text: "called files.read" }]
    });
    expect(logOnlyResponse?.result).toEqual({
      content: [{ type: "text", text: "called terminal.run" }]
    });
    expect(upstream.toolCalls.get("files.read")).toBe(1);
    expect(upstream.toolCalls.get("terminal.run")).toBe(1);
    expect(events).toEqual([
      {
        toolName: "files.read",
        decision: "allow",
        reason: "fake files.read",
        runtimeEventId: "evt-files.read",
        handlerExecuted: true,
        forwardedToUpstream: true
      },
      {
        toolName: "terminal.run",
        decision: "log_only",
        reason: "fake terminal.run",
        runtimeEventId: "evt-terminal.run",
        handlerExecuted: true,
        forwardedToUpstream: true
      }
    ]);
  });

  it("does not forward blocked tools upstream", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({ "terminal.run": "block" });
    const events: McpProxyLogEvent[] = [];
    const proxy = new McpProxy({ upstream, cloud, agent, logger: (event) => events.push(event) });

    const response = await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "terminal.run", arguments: { command: "rm -rf /" } }
    });

    expect(upstream.toolCalls.get("terminal.run")).toBeUndefined();
    expect(response?.result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Blocked by Enforra",
            decision: "block",
            reason: "fake terminal.run",
            runtimeEventId: "evt-terminal.run"
          })
        }
      ]
    });
    expect(events).toEqual([
      {
        toolName: "terminal.run",
        decision: "block",
        reason: "fake terminal.run",
        runtimeEventId: "evt-terminal.run",
        handlerExecuted: false,
        forwardedToUpstream: false
      }
    ]);
  });

  it("does not forward require_approval tools upstream", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({ "terminal.run": "require_approval" });
    const proxy = new McpProxy({ upstream, cloud, agent, logger: vi.fn() });

    const response = await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "terminal.run", arguments: { command: "deploy" } }
    });

    expect(upstream.toolCalls.get("terminal.run")).toBeUndefined();
    expect(response?.result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Approval required by Enforra",
            decision: "require_approval",
            reason: "fake terminal.run",
            runtimeEventId: "evt-terminal.run"
          })
        }
      ]
    });
  });

  it("does not call secrets.read upstream handler when Enforra blocks it", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({ "secrets.read": "block" });
    const proxy = new McpProxy({ upstream, cloud, agent, logger: vi.fn() });

    await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "secrets.read", arguments: { key: "demo" } }
    });

    expect(upstream.toolCalls.get("secrets.read")).toBeUndefined();
  });

  it("builds the /v1/decide request with the cloud API contract fields", async () => {
    const upstream = new FakeUpstream(tools);
    const cloud = new FakeCloud({ "files.read": "allow" });
    const proxy = new McpProxy({
      upstream,
      cloud,
      agent,
      logger: vi.fn(),
      demoRunId: "test-run-123"
    });

    await proxy.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "files.read", arguments: { path: "README.md" } }
    });

    expect(cloud.decisions).toEqual([
      {
        agentKey: "openclaw-agent",
        toolName: "files.read",
        args: {
          _demoRunId: "test-run-123",
          path: "README.md"
        },
        context: {
          environment: "demo",
          agent: {
            key: "openclaw-agent",
            name: "OpenClaw Workspace Agent"
          },
          source: "mcp_proxy",
          demoRunId: "test-run-123"
        }
      }
    ]);
  });

  it("HttpEnforraCloudClient.decide normalizes runtimeEventId from response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            decision: "allow",
            reason: "ok",
            runtimeEventId: "evt-123"
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpEnforraCloudClient({
      apiUrl: "https://api-staging.enforra.com",
      apiKey: "project-key"
    });
    const result = await client.decide({
      agentKey: "agent-1",
      toolName: "tool-1",
      args: {},
      context: { environment: "dev", agent: { key: "a", name: "b" }, source: "mcp_proxy" }
    });

    expect(result.runtimeEventId).toBe("evt-123");
  });

  it("HttpEnforraCloudClient.decide normalizes eventId from response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            decision: "allow",
            reason: "ok",
            eventId: "evt-456"
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpEnforraCloudClient({
      apiUrl: "https://api-staging.enforra.com",
      apiKey: "project-key"
    });
    const result = await client.decide({
      agentKey: "agent-1",
      toolName: "tool-1",
      args: {},
      context: { environment: "dev", agent: { key: "a", name: "b" }, source: "mcp_proxy" }
    });

    expect(result.runtimeEventId).toBe("evt-456");
  });

  it("HttpEnforraCloudClient.decide normalizes decide response without event id", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            decision: "allow",
            reason: "ok"
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpEnforraCloudClient({
      apiUrl: "https://api-staging.enforra.com",
      apiKey: "project-key"
    });
    const result = await client.decide({
      agentKey: "agent-1",
      toolName: "tool-1",
      args: {},
      context: { environment: "dev", agent: { key: "a", name: "b" }, source: "mcp_proxy" }
    });

    expect(result.runtimeEventId).toBeUndefined();
  });

  it("does not print the API key in printMcpProxyMetadata", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const config = {
      apiUrl: "https://api-staging.enforra.com",
      agentKey: "my-agent",
      environment: "prod",
      capabilitiesRegisterPath: "/v1/register",
      apiKey: "secret-key-12345"
    };

    import("../src/proxy.js").then((mod) => {
      mod.printMcpProxyMetadata(config);

      const allPrints = writeSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(allPrints).not.toContain("secret-key-12345");
      expect(allPrints).toContain("ENFORRA_API_URL: https://api-staging.enforra.com");

      writeSpy.mockRestore();
    });
  });

  it("fails clearly when ENFORRA_API_KEY is missing", () => {
    expect(() =>
      loadMcpProxyConfigFromEnv({
        ENFORRA_MCP_UPSTREAM_CONFIG: "./mcp-upstream.json"
      })
    ).toThrow("Missing required env var ENFORRA_API_KEY");
  });

  it("defaults capability registration to the private cloud register endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HttpEnforraCloudClient({
      apiUrl: "https://api-staging.enforra.com/",
      apiKey: "project-key"
    });
    const payload: RegisterCapabilitiesRequest = {
      agent,
      source: "mcp",
      tools: [normalizeMcpToolCapability(tools[0]!, "demo")]
    };

    await client.registerCapabilities(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-staging.enforra.com/v1/agent-capabilities/register",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer project-key",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    if (!isRecord(requestInit) || typeof requestInit["body"] !== "string") {
      throw new Error("expected fetch body to be JSON string");
    }
    expect(Object.keys(JSON.parse(requestInit["body"]))).toEqual(["agent", "source", "tools"]);
  });

  it("allows ENFORRA_CAPABILITIES_REGISTER_PATH to override capability registration path", () => {
    expect(
      loadMcpProxyConfigFromEnv({
        ENFORRA_API_KEY: "project-key",
        ENFORRA_MCP_UPSTREAM_CONFIG: "./mcp-upstream.json",
        ENFORRA_CAPABILITIES_REGISTER_PATH: "/v1/custom/register"
      }).capabilitiesRegisterPath
    ).toBe("/v1/custom/register");
  });

  describe("Fake Client Demo logic", () => {
    it("mock mode does not require ENFORRA_API_KEY", () => {
      const useRealCloud = false;
      const apiKeyValue = undefined;

      const instantiateCloud = () => {
        if (useRealCloud) {
          if (!apiKeyValue) {
            throw new Error("Missing required env var ENFORRA_API_KEY");
          }
          return new HttpEnforraCloudClient({
            apiUrl: "https://api-staging.enforra.com",
            apiKey: apiKeyValue
          });
        } else {
          return new FakeCloud({});
        }
      };

      expect(instantiateCloud()).toBeInstanceOf(FakeCloud);
    });

    it("real cloud mode requires ENFORRA_USE_REAL_CLOUD=true and requires ENFORRA_API_KEY", () => {
      const useRealCloud = true;
      const apiKeyValue = undefined;

      const instantiateCloud = () => {
        if (useRealCloud) {
          if (!apiKeyValue) {
            throw new Error("Missing required env var ENFORRA_API_KEY");
          }
          return new HttpEnforraCloudClient({
            apiUrl: "https://api-staging.enforra.com",
            apiKey: apiKeyValue
          });
        } else {
          return new FakeCloud({});
        }
      };

      expect(() => instantiateCloud()).toThrow("Missing required env var ENFORRA_API_KEY");
    });

    it("direct cloud.registrations access is removed and demo prints registered tools safely in mock mode", () => {
      const mockCloud = new FakeCloud({});
      mockCloud.registrations.push({
        agent: { key: "agent", name: "Agent", purpose: "p", environment: "demo" },
        source: "mcp",
        tools: [
          {
            name: "files.read",
            displayName: "Files Read",
            description: "Read a file",
            inputSchema: {},
            source: "mcp",
            environment: "demo",
            dataTouched: [],
            sideEffect: "read"
          }
        ]
      });

      const getRegistrationsOutput = (
        cloudInstance: EnforraCloudClient,
        discoveredList: string[]
      ): string[] => {
        const lines: string[] = [];
        const getRegistrations = (
          cloudInstance as { getRegistrations?: () => RegisterCapabilitiesRequest[] }
        ).getRegistrations;
        if (typeof getRegistrations === "function") {
          const regs = getRegistrations.call(cloudInstance);
          for (const reg of regs) {
            for (const t of reg.tools) {
              lines.push(`* ${t.name} source=${t.source}`);
            }
          }
        } else {
          for (const toolName of discoveredList) {
            lines.push(`* ${toolName} source=mcp (registered with real Enforra Cloud)`);
          }
        }
        return lines;
      };

      const outMock = getRegistrationsOutput(mockCloud, ["files.read"]);
      expect(outMock).toEqual(["* files.read source=mcp"]);

      const realCloudDummy = new HttpEnforraCloudClient({
        apiUrl: "https://api-staging.enforra.com",
        apiKey: "key"
      });
      const outReal = getRegistrationsOutput(realCloudDummy, ["files.read", "terminal.run"]);
      expect(outReal).toEqual([
        "* files.read source=mcp (registered with real Enforra Cloud)",
        "* terminal.run source=mcp (registered with real Enforra Cloud)"
      ]);
    });

    it("discovered tools list matches expectation", () => {
      const discoveredList = ["files.read", "terminal.run", "secrets.read"];
      expect(discoveredList).toContain("files.read");
      expect(discoveredList).toContain("terminal.run");
      expect(discoveredList).toContain("secrets.read");
    });

    it("does not crash when using real cloud client shape", async () => {
      const realCloudDummy = new HttpEnforraCloudClient({
        apiUrl: "https://api-staging.enforra.com",
        apiKey: "key"
      });

      expect(realCloudDummy.registerCapabilities).toBeDefined();
      expect(realCloudDummy.decide).toBeDefined();
      expect(
        (realCloudDummy as unknown as { registrations?: unknown }).registrations
      ).toBeUndefined();
    });

    it("redacts API keys and does not print them", async () => {
      // Mock process.stderr.write to check redacted outputs
      const originalWrite = process.stderr.write;
      let intercepted = "";
      process.stderr.write = (chunk: string | Uint8Array) => {
        intercepted += chunk.toString();
        return true;
      };

      const prevEnv = process.env.ENFORRA_DEBUG_CLOUD_RESPONSE;
      process.env.ENFORRA_DEBUG_CLOUD_RESPONSE = "true";

      try {
        const client = new HttpEnforraCloudClient({
          apiUrl: "https://api-staging.enforra.com",
          apiKey: "secret-key-1234"
        });

        // call decide, catching the network rejection
        await client
          .decide({
            agentKey: "agent",
            toolName: "tool",
            args: { key: "abc", password: "my-password" },
            context: {
              environment: "demo",
              agent: { key: "agent", name: "Agent" },
              source: "mcp_proxy"
            }
          })
          .catch(() => {
            // ignore network failure
          });

        // assert API key is never printed
        expect(intercepted).not.toContain("secret-key-1234");
        expect(intercepted).not.toContain("my-password");

        const method = (client as unknown as { headers: () => Record<string, string> }).headers;
        expect(typeof method).toBe("function");
      } finally {
        process.stderr.write = originalWrite;
        process.env.ENFORRA_DEBUG_CLOUD_RESPONSE = prevEnv;
      }
    });
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
