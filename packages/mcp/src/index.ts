/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EnforraClient } from "@enforra/sdk-node";

/**
 * Options for guarding an MCP-style tool call.
 */
export interface GuardMcpToolOptions<TArgs = any, TResult = any> {
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
  context?: Record<string, any> | ((args: TArgs) => Record<string, any>);

  /**
   * The actual tool execution handler to guard.
   */
  execute: (args: TArgs) => Promise<TResult> | TResult;
}

/**
 * Structured result returned by the guarded tool handler.
 * It is directly compatible with the MCP CallToolResult structure.
 */
export interface GuardMcpToolResult<TResult = any> {
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
  content: Array<{
    type: "text";
    text: string;
  }>;

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
  TArgs extends Record<string, any> = Record<string, any>,
  TResult = any
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
      const data = enforceResult.data;
      let textContent = "";

      if (data !== undefined && data !== null) {
        if (typeof data === "string") {
          textContent = data;
        } else if (
          typeof data === "object" &&
          "content" in data &&
          Array.isArray((data as any).content) &&
          (data as any).content.every((c: any) => c && typeof c === "object" && "type" in c)
        ) {
          // If the execute handler already returns a standard MCP structure with content arrays,
          // pass it along.
          return {
            ok: true,
            decision: enforceResult.decision as "allow" | "log_only",
            executed: true,
            reason: enforceResult.reason,
            data,
            content: (data as any).content,
            isError: !!(data as any).isError
          };
        } else {
          textContent = JSON.stringify(data);
        }
      }

      return {
        ok: true,
        decision: enforceResult.decision as "allow" | "log_only",
        executed: true,
        reason: enforceResult.reason,
        data,
        isError: false,
        content: [{ type: "text", text: textContent }]
      };
    } else {
      // Execution failed (due to handler throwing or audit logger failing)
      const errorMsg = enforceResult.error?.message || "Unknown tool execution error";
      return {
        ok: false,
        decision: enforceResult.decision as "allow" | "log_only",
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
export interface WrapMcpToolOptions<TArgs = any, TResult = any> {
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
  context?: Record<string, any> | ((args: TArgs) => Record<string, any>);

  /**
   * The actual tool handler function.
   */
  handler: (args: TArgs) => Promise<TResult> | TResult;
}

/**
 * Standard MCP CallToolResult structure returned by wrapMcpTool.
 */
export interface McpCallToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Wraps an MCP-style tool handler with Enforra policy enforcement.
 * Enforces policies before executing the handler, and maps execution results
 * directly to a standard MCP CallToolResult structure.
 *
 * @param enforra The EnforraClient instance containing loaded policies.
 * @param options Options defining the tool name, agent, context, and handler logic.
 */
export function wrapMcpTool<TArgs extends Record<string, any> = Record<string, any>, TResult = any>(
  enforra: EnforraClient,
  options: WrapMcpToolOptions<TArgs, TResult>
): (args: TArgs) => Promise<McpCallToolResult & Record<string, any>> {
  return async (args: TArgs): Promise<McpCallToolResult & Record<string, any>> => {
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
      const data = enforceResult.data;
      let textContent = "";

      if (data !== undefined && data !== null) {
        if (typeof data === "string") {
          textContent = data;
        } else if (
          typeof data === "object" &&
          "content" in data &&
          Array.isArray((data as any).content) &&
          (data as any).content.every((c: any) => c && typeof c === "object" && "type" in c)
        ) {
          return {
            content: (data as any).content,
            isError: !!(data as any).isError,
            ok: true,
            decision: enforceResult.decision as "allow" | "log_only",
            executed: true,
            reason: enforceResult.reason,
            data
          };
        } else {
          textContent = JSON.stringify(data);
        }
      }

      return {
        isError: false,
        content: [{ type: "text", text: textContent }],
        ok: true,
        decision: enforceResult.decision as "allow" | "log_only",
        executed: true,
        reason: enforceResult.reason,
        data
      };
    } else {
      // Execution failed (due to handler throwing or audit logger failing)
      const errorMsg = enforceResult.error?.message || "Unknown tool execution error";
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${errorMsg}` }],
        ok: false,
        decision: enforceResult.decision as "allow" | "log_only",
        executed: enforceResult.executed,
        reason: enforceResult.reason,
        error: errorMsg
      };
    }
  };
}
