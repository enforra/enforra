import { JsonRpcEndpoint, type JsonRpcRequest, type JsonRpcResponse } from "@enforra/mcp";

const tools = [
  {
    name: "files.read",
    description: "Read fake workspace file content",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" }
      }
    }
  },
  {
    name: "terminal.run",
    description: "Return fake terminal output without running a command",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" }
      }
    }
  },
  {
    name: "secrets.read",
    description: "Return fake secret text only if the handler is actually called",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" }
      }
    }
  }
];

const endpoint = new JsonRpcEndpoint(process.stdin, process.stdout);
endpoint.onRequest = async (request): Promise<JsonRpcResponse | undefined> => {
  if (request.id === undefined) {
    return undefined;
  }

  if (request.method === "tools/list") {
    return createResult(request.id, { tools });
  }

  if (request.method === "tools/call") {
    return createResult(request.id, handleToolCall(request));
  }

  return createError(request.id, `Unknown method: ${request.method}`, -32601);
};

function handleToolCall(request: JsonRpcRequest): unknown {
  if (!isRecord(request.params) || typeof request.params["name"] !== "string") {
    return { isError: true, content: [{ type: "text", text: "Invalid fake tool call" }] };
  }

  const name = request.params["name"];
  if (name === "files.read") {
    return {
      content: [{ type: "text", text: "fake file content for demo.txt" }]
    };
  }

  if (name === "terminal.run") {
    return {
      content: [{ type: "text", text: "fake terminal output" }]
    };
  }

  if (name === "secrets.read") {
    return {
      content: [{ type: "text", text: "fake secret text" }]
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown fake tool: ${name}` }] };
}

function createResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function createError(id: string | number | null, message: string, code: number): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
