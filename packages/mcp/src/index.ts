import type { EnforraClient } from "@enforra/sdk-node";

type JsonObject = Record<string, unknown>;
type McpTextContent = {
  type: "text";
  text: string;
};

type SuccessfulDecision = "allow" | "log_only";
type McpLikeResult = {
  content: McpTextContent[];
  isError?: boolean;
};

/**
 * Options for guarding an MCP-style tool call.
 */
export interface GuardMcpToolOptions<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown
> {
  /**
   * The name/ID of the agent invoking the tool.
   */
  agent: string;

  /**
   * The name of the tool being executed (e.g. 'mcp.filesystem.read').
   */
  tool: string;

  /**
   * Static context object, or a function resolving context from the tool arguments.
   */
  context?: JsonObject | ((args: TArgs) => JsonObject);

  /**
   * The actual tool execution handler to guard.
   */
  execute: (args: TArgs) => Promise<TResult> | TResult;
}

/**
 * Structured result returned by the guarded tool handler.
 * It is directly compatible with the MCP CallToolResult structure.
 */
export interface GuardMcpToolResult<TResult = unknown> {
  /**
   * Whether the tool execution was allowed and completed successfully.
   */
  ok: boolean;

  /**
   * The policy decision evaluated by Enforra.
   */
  decision: "allow" | "log_only" | "block" | "require_approval";

  /**
   * Whether the tool execute handler was actually run.
   */
  executed: boolean;

  /**
   * The match description or reason from the policy evaluation.
   */
  reason: string;

  /**
   * The result data returned by the tool handler if execution succeeded.
   */
  data?: TResult;

  /**
   * Error message if execution threw an error or was blocked.
   */
  error?: string;

  /**
   * Standard MCP tool response content list.
   */
  content: McpTextContent[];

  /**
   * Standard MCP tool response error flag.
   */
  isError: boolean;
}

/**
 * Wraps an MCP-style tool handler with Enforra policy enforcement.
 * Returns a function that accepts tool arguments and returns a structured result.
 *
 * @param enforra The EnforraClient instance containing loaded policies.
 * @param options Options defining the agent, tool, context, and handler logic.
 */
export function guardMcpTool<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown
>(
  enforra: EnforraClient,
  options: GuardMcpToolOptions<TArgs, TResult>
): (args: TArgs) => Promise<GuardMcpToolResult<TResult>> {
  return async (args: TArgs): Promise<GuardMcpToolResult<TResult>> => {
    // Resolve context if it's a function
    const resolvedContext =
      typeof options.context === "function" ? options.context(args) : options.context;

    const enforceResult = await enforra.enforceToolCall({
      agent: options.agent,
      tool: options.tool,
      args,
      context: resolvedContext,
      execute: async () => {
        return await options.execute(args);
      }
    });

    // 1. Handle block decision
    if (enforceResult.decision === "block") {
      const errorMsg = `Blocked by policy: ${enforceResult.reason}`;
      return {
        ok: false,
        decision: "block",
        executed: false,
        reason: enforceResult.reason,
        error: errorMsg,
        isError: true,
        content: [{ type: "text", text: errorMsg }]
      };
    }

    // 2. Handle require_approval decision
    if (enforceResult.decision === "require_approval") {
      const errorMsg = `Requires approval: ${enforceResult.reason}`;
      return {
        ok: false,
        decision: "require_approval",
        executed: false,
        reason: enforceResult.reason,
        error: errorMsg,
        isError: true,
        content: [{ type: "text", text: errorMsg }]
      };
    }

    // 3. Handle allow or log_only decision
    if (enforceResult.ok) {
      // Execution succeeded
      return createSuccessfulResult(
        enforceResult.decision,
        enforceResult.reason,
        enforceResult.data
      );
    } else {
      // Execution failed (due to handler throwing or audit logger failing)
      const errorMsg = enforceResult.error?.message || "Unknown tool execution error";
      return {
        ok: false,
        decision: enforceResult.decision,
        executed: enforceResult.executed,
        reason: enforceResult.reason,
        error: errorMsg,
        isError: true,
        content: [{ type: "text", text: `Error: ${errorMsg}` }]
      };
    }
  };
}

/**
 * Options for wrapping an MCP-style tool call.
 */
export interface WrapMcpToolOptions<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown
> {
  /**
   * The name of the tool being executed (e.g. 'github.create_issue').
   */
  toolName: string;

  /**
   * The name/ID of the agent invoking the tool.
   * If not specified, uses the enforra client's default agent or defaults to 'mcp-agent'.
   */
  agent?: string;

  /**
   * Static context object, or a function resolving context from the tool arguments.
   */
  context?: JsonObject | ((args: TArgs) => JsonObject);

  /**
   * The actual tool handler function.
   */
  handler: (args: TArgs) => Promise<TResult> | TResult;
}

/**
 * Standard MCP CallToolResult structure returned by wrapMcpTool.
 */
export interface McpCallToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

export interface WrappedMcpToolResult<TResult = unknown>
  extends McpCallToolResult, Omit<GuardMcpToolResult<TResult>, "content" | "isError"> {
  isError: boolean;
}

/**
 * Wraps an MCP-style tool handler with Enforra policy enforcement.
 * Enforces policies before executing the handler, and maps execution results
 * directly to a standard MCP CallToolResult structure.
 *
 * @param enforra The EnforraClient instance containing loaded policies.
 * @param options Options defining the tool name, agent, context, and handler logic.
 */
export function wrapMcpTool<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown
>(
  enforra: EnforraClient,
  options: WrapMcpToolOptions<TArgs, TResult>
): (args: TArgs) => Promise<WrappedMcpToolResult<TResult>> {
  return async (args: TArgs): Promise<WrappedMcpToolResult<TResult>> => {
    const agent = options.agent ?? enforra.agent ?? "mcp-agent";
    const resolvedContext =
      typeof options.context === "function" ? options.context(args) : options.context;

    const enforceResult = await enforra.enforceToolCall({
      agent,
      tool: options.toolName,
      args,
      context: resolvedContext,
      execute: async () => {
        return await options.handler(args);
      }
    });

    // 1. Handle block decision
    if (enforceResult.decision === "block") {
      const errorMsg = `Blocked by policy: ${enforceResult.reason}`;
      return {
        isError: true,
        content: [{ type: "text", text: errorMsg }],
        ok: false,
        decision: "block",
        executed: false,
        reason: enforceResult.reason,
        error: errorMsg
      };
    }

    // 2. Handle require_approval decision
    if (enforceResult.decision === "require_approval") {
      const errorMsg = `Requires approval: ${enforceResult.reason}`;
      return {
        isError: true,
        content: [{ type: "text", text: errorMsg }],
        ok: false,
        decision: "require_approval",
        executed: false,
        reason: enforceResult.reason,
        error: errorMsg
      };
    }

    // 3. Handle allow or log_only decision
    if (enforceResult.ok) {
      return createSuccessfulResult(
        enforceResult.decision,
        enforceResult.reason,
        enforceResult.data
      );
    } else {
      // Execution failed (due to handler throwing or audit logger failing)
      const errorMsg = enforceResult.error?.message || "Unknown tool execution error";
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${errorMsg}` }],
        ok: false,
        decision: enforceResult.decision,
        executed: enforceResult.executed,
        reason: enforceResult.reason,
        error: errorMsg
      };
    }
  };
}

function createSuccessfulResult<TResult>(
  decision: SuccessfulDecision,
  reason: string,
  data: TResult
): GuardMcpToolResult<TResult> {
  if (isMcpLikeResult(data)) {
    return {
      ok: true,
      decision,
      executed: true,
      reason,
      data,
      content: data.content,
      isError: data.isError === true
    };
  }

  return {
    ok: true,
    decision,
    executed: true,
    reason,
    data,
    isError: false,
    content: [{ type: "text", text: stringifyToolData(data) }]
  };
}

function stringifyToolData(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data === undefined || data === null) {
    return "";
  }

  return JSON.stringify(data);
}

function isMcpLikeResult(value: unknown): value is McpLikeResult {
  if (!isRecord(value)) {
    return false;
  }

  const content = value["content"];
  if (!Array.isArray(content)) {
    return false;
  }

  return content.every(isMcpTextContent);
}

function isMcpTextContent(value: unknown): value is McpTextContent {
  if (!isRecord(value)) {
    return false;
  }

  return value["type"] === "text" && typeof value["text"] === "string";
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}
