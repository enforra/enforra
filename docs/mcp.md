# Model Context Protocol (MCP) Integration

Enforra MCP support has two modes:

- Local MCP tool handler wrapping with local OSS policy evaluation.
- A local/sidecar MCP proxy that calls Enforra Cloud before forwarding tool calls upstream.

## Architectural Overview

### Local MCP Proxy

```text
MCP client
-> Enforra MCP proxy
-> upstream MCP server
```

The proxy is useful when an MCP client can be configured to launch or connect to a proxy command instead of directly launching the upstream server.

On `tools/list`, the proxy:

1. Calls upstream MCP `tools/list`.
2. Receives the original upstream tool definitions.
3. Normalizes each tool into Enforra capability metadata.
4. Registers those capabilities with Enforra Cloud using the project API key.
5. Returns the original upstream MCP tool list to the MCP client.

On `tools/call`, the proxy:

1. Calls Enforra Cloud `/v1/decide`.
2. For `allow` or `log_only`, forwards the original MCP tool call upstream.
3. For `block` or `require_approval`, returns an MCP-compatible error result and does not forward upstream.

OpenClaw can use this path if it supports configuring MCP servers/tools. This package is not OpenClaw-specific.

#### Proxy Setup

1. Create an Enforra project.
2. Create a project API key.
3. Start or configure the upstream MCP server.
4. Create an upstream config file:

```json
{
  "transport": "stdio",
  "command": "node",
  "args": ["./examples/fake-mcp-server/dist/server.js"],
  "env": {}
}
```

5. Start the Enforra MCP proxy:

```bash
ENFORRA_API_URL=https://api-staging.enforra.com \
ENFORRA_API_KEY=<project api key> \
ENFORRA_AGENT_KEY=openclaw-agent \
ENFORRA_AGENT_NAME="OpenClaw Workspace Agent" \
ENFORRA_AGENT_PURPOSE="Developer workspace agent" \
ENFORRA_ENVIRONMENT=demo \
ENFORRA_MCP_UPSTREAM_CONFIG=./mcp-upstream.json \
enforra-mcp-proxy
```

6. Point the MCP client at the Enforra MCP proxy.
7. Run `tools/list`.
8. Check Agent Intelligence for MCP-discovered capabilities.
9. Create policies.
10. Run `tools/call`.
11. Check Runtime Events.

#### Explainable MCP Capability Inference

The proxy uses deterministic rules and does not call AI.

- `read`, `get`, `list`, `search`, `file` -> data touched includes `workspace data`, side effect `read`
- `secret`, `token`, `key`, `env`, `credential` -> data touched includes `credentials`, side effect `sensitive read`
- `terminal`, `shell`, `command`, `run`, `exec` -> data touched includes `local environment`, side effect `command_execution`
- `write`, `update`, `create`, `delete`, `deploy`, `send`, `refund` -> side effect `external_or_destructive_action`
- otherwise -> data touched `unknown`, side effect `unknown`

#### Proxy Scope

V1 supports stdio upstream MCP servers. It does not build a hosted MCP gateway, OAuth, secret storage, or an OpenClaw adapter.

### In-Server Wrapping

`@enforra/mcp` also provides lightweight helpers to wrap MCP tool handlers inside the application/server. The host application continues to own the execution, configuration, and transport of the MCP server.

```mermaid
graph TD
    Client[AI Client / Host] -->|Call Tool| Server[Your MCP Server]
    subgraph Server [Your MCP Server]
        Handler[Guarded Tool Handler] -->|1. Evaluate Policy| Enforra[Enforra SDK]
        Enforra -->|2. Allow / Block Decision| Handler
        Handler -->|3. Run logic (if allowed)| ActualTool[Actual Tool Implementation]
    end
```

## Key Behavior

1. **Local Guarding**: Policy evaluation runs locally before your wrapped tool handler executes.
2. **Execution Ownership**: Your application/server still runs the tool handler logic. Enforra does not execute tools remotely.
3. **Decisions**:
   - `allow`: Executes the handler.
   - `log_only`: Executes the handler and logs the call.
   - `block`: Prevents execution and returns a structured block response.
   - `require_approval`:
     > [!NOTE]
     > In Enforra OSS, `require_approval` only marks the decision in the audit log and returned result; it does not trigger a hosted approval workflow.
4. **Structured Output**: Returns a result object containing standardized MCP `content` and `isError` properties, allowing you to return the result directly as a tool response or convert it easily.

## Usage Example

Wrap your tool execution handlers with `guardMcpTool`:

```typescript
import { createEnforraClient } from "@enforra/sdk-node";
import { guardMcpTool } from "@enforra/mcp";

const enforra = await createEnforraClient({
  policyPath: "./policies/mcp-tools.yaml"
});

// Guard an MCP filesystem read tool
const readToolHandler = guardMcpTool(enforra, {
  agent: "mcp-agent",
  tool: "mcp.filesystem.read",
  // Map arguments to context if needed
  context: (args) => ({
    environment: process.env.NODE_ENV || "development"
  }),
  execute: async (args: { path: string }) => {
    // Your actual tool execution logic here
    return fs.promises.readFile(args.path, "utf-8");
  }
});

// In your MCP server handler registration
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "mcp.filesystem.read") {
    const result = await readToolHandler(args);

    // Returns a compatible result that can be returned directly:
    // { isError: boolean, content: [{ type: "text", text: string }] }
    return result;
  }
});
```

### Wrapping with `wrapMcpTool`

You can also use `wrapMcpTool` to directly wrap handlers for standard MCP server frameworks. It supports retrieving default agent configurations initialized on the Enforra client:

```typescript
import { createEnforraClient } from "@enforra/sdk-node";
import { wrapMcpTool } from "@enforra/mcp";

const enforra = await createEnforraClient({
  policyPath: "./policies/mcp-tools.yaml",
  agent: "coding-agent" // Set default agent
});

// Register tool wrapper
const getIssueHandler = wrapMcpTool(enforra, {
  toolName: "github.get_issue",
  handler: async (args: { issueId: string }) => {
    return fetchGitHubIssue(args.issueId);
  }
});

// Integrate with standard MCP request handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === "github.get_issue") {
    return await getIssueHandler(args);
  }
});
```

## Real-world MCP examples

For comprehensive demonstrations of MCP-style tool handler governance, explore the following examples:

- [MCP Coding Agent](../examples/mcp/mcp-coding-agent)
- [MCP GitHub Agent](../examples/mcp/mcp-github-agent)
- [MCP Server Governance](../examples/mcp/mcp-server-governance)

For a detailed comparative breakdown, see the [MCP Examples Guide](mcp-examples.md).
