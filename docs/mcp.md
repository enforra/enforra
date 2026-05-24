# Model Context Protocol (MCP) Integration

Enforra OSS provides support for guarding MCP-style tool calls before they run.

## Architectural Overview

> [!IMPORTANT]
> **Enforra is not an MCP gateway or proxy.**
> It does not sit between the client and the server as an intermediary, nor does it intercept network traffic or handle authentication/transport.

Instead, `@enforra/mcp` provides lightweight helpers to **wrap MCP tool handlers inside the application/server**. The host application continues to own the execution, configuration, and transport (e.g., STDIO, SSE) of the MCP server.

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

1. **Local Guarding**: Policy evaluation runs locally before your tool handler executes.
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
