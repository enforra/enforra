import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createLocalAuditLogger,
  type AuditEventInput,
  type LocalAuditLogger
} from "@enforra/local-audit";
import { createClient } from "@enforra/sdk-node";
import type { PolicyFile } from "@enforra/policy-core";
import { guardMcpTool, wrapMcpTool } from "../src/index.js";

function createMemoryAuditLogger(events: AuditEventInput[]): LocalAuditLogger {
  return {
    async append(event: AuditEventInput) {
      events.push(event);
      return {
        id: `audit-${events.length}`,
        timestamp: "2026-05-22T00:00:00.000Z",
        agent: event.agent,
        tool: event.tool,
        decision: event.decision,
        matchedPolicyId: event.matchedPolicyId,
        status: event.status,
        argsRedacted: event.args,
        contextRedacted: event.context,
        durationMs: event.durationMs,
        error: event.error
      };
    }
  };
}

const testPolicy: PolicyFile = {
  version: 1,
  defaults: { decision: "block" as const },
  policies: [
    {
      id: "allow-filesystem-read",
      match: { agent: "mcp-agent", tool: "mcp.filesystem.read" },
      decision: "allow" as const
    },
    {
      id: "log-only-filesystem-read-logged",
      match: { agent: "mcp-agent", tool: "mcp.filesystem.read_logged" },
      decision: "log_only" as const
    },
    {
      id: "require-approval-filesystem-write",
      match: { agent: "mcp-agent", tool: "mcp.filesystem.write" },
      decision: "require_approval" as const
    },
    {
      id: "block-shell-run-prod",
      match: { agent: "mcp-agent", tool: "mcp.shell.run" },
      conditions: [{ field: "context.environment", operator: "eq" as const, value: "production" }],
      decision: "block" as const
    },
    {
      id: "allow-shell-run-dev",
      match: { agent: "mcp-agent", tool: "mcp.shell.run" },
      conditions: [{ field: "context.environment", operator: "eq" as const, value: "development" }],
      decision: "allow" as const
    },
    {
      id: "allow-conditional-args",
      match: { agent: "mcp-agent", tool: "mcp.args-test" },
      conditions: [{ field: "args.secret", operator: "eq" as const, value: "open-sesame" }],
      decision: "allow" as const
    }
  ]
};

describe("guardMcpTool", () => {
  it("allow decision: executes handler and logs success", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async (args: { path: string }) => {
      return `Content of ${args.path}`;
    });

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.filesystem.read",
      execute
    });

    const result = await handler({ path: "/foo/bar" });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ path: "/foo/bar" });

    expect(result).toEqual({
      ok: true,
      decision: "allow",
      executed: true,
      reason: "matched policy allow-filesystem-read",
      data: "Content of /foo/bar",
      isError: false,
      content: [{ type: "text", text: "Content of /foo/bar" }]
    });

    // Check audit logs
    expect(events).toHaveLength(2);
    expect(events[0]?.status).toBe("decision_logged");
    expect(events[1]?.status).toBe("executed");
  });

  it("log_only decision: executes handler and logs success", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => {
      return { success: true };
    });

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.filesystem.read_logged",
      execute
    });

    const result = await handler({});

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      decision: "log_only",
      executed: true,
      reason: "matched policy log-only-filesystem-read-logged",
      data: { success: true },
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ success: true }) }]
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.status).toBe("decision_logged");
    expect(events[1]?.status).toBe("logged");
  });

  it("block decision: does not execute handler and returns structured block response", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => "shell output");

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.shell.run",
      context: { environment: "production" },
      execute
    });

    const result = await handler({ cmd: "rm -rf /" });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      decision: "block",
      executed: false,
      reason: "matched policy block-shell-run-prod",
      error: "Blocked by policy: matched policy block-shell-run-prod",
      isError: true,
      content: [{ type: "text", text: "Blocked by policy: matched policy block-shell-run-prod" }]
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("blocked");
  });

  it("require_approval decision: does not execute handler and returns structured approval response", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => "done");

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.filesystem.write",
      execute
    });

    const result = await handler({ path: "/foo/bar", content: "data" });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      decision: "require_approval",
      executed: false,
      reason: "matched policy require-approval-filesystem-write",
      error: "Requires approval: matched policy require-approval-filesystem-write",
      isError: true,
      content: [
        {
          type: "text",
          text: "Requires approval: matched policy require-approval-filesystem-write"
        }
      ]
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("pending_approval");
  });

  it("args are passed into policy evaluation", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => "ok");

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.args-test",
      execute
    });

    // Allowed because args.secret matches "open-sesame"
    const resultAllowed = await handler({ secret: "open-sesame" });
    expect(resultAllowed.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);

    // Blocked by default because args do not match
    const resultBlocked = await handler({ secret: "wrong-password" });
    expect(resultBlocked.ok).toBe(false);
    expect(resultBlocked.decision).toBe("block");
    expect(execute).toHaveBeenCalledTimes(1); // Still only 1 from previous call
  });

  it("context.environment can be used in policy", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => "done");

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.shell.run",
      context: (args: { isDev: boolean }) => ({
        environment: args.isDev ? "development" : "production"
      }),
      execute
    });

    // Dev environment is allowed
    const resultDev = await handler({ isDev: true });
    expect(resultDev.ok).toBe(true);
    expect(resultDev.decision).toBe("allow");

    // Prod environment is blocked
    const resultProd = await handler({ isDev: false });
    expect(resultProd.ok).toBe(false);
    expect(resultProd.decision).toBe("block");
  });

  it("errors thrown by handler are caught and returned in structured error response", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => {
      throw new Error("Disk full");
    });

    const handler = guardMcpTool(client, {
      agent: "mcp-agent",
      tool: "mcp.filesystem.read",
      execute
    });

    const result = await handler({ path: "/file" });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      decision: "allow",
      executed: true,
      reason: "matched policy allow-filesystem-read",
      error: "Disk full",
      isError: true,
      content: [{ type: "text", text: "Error: Disk full" }]
    });

    expect(events).toHaveLength(2); // decision_logged, failed
    expect(events[events.length - 1]?.status).toBe("failed");
    expect(events[events.length - 1]?.error).toBe("Disk full");
  });
});

const observeTestPolicy: PolicyFile = {
  version: 1,
  mode: "observe" as const,
  defaults: { decision: "block" as const },
  policies: [
    {
      id: "block-large-refunds",
      match: { agent: "coding-agent", tool: "stripe.refund" },
      conditions: [{ field: "args.amount", operator: "gt" as const, value: 500 }],
      decision: "block" as const
    }
  ]
};

describe("wrapMcpTool", () => {
  it("allow decision executes handler, log_only executes handler, block / require_approval do not execute handler", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    client.agent = "mcp-agent";

    // 1. Allow
    const allowHandler = vi.fn(async (args: { path: string }) => `allow-res-${args.path}`);
    const wrappedAllow = wrapMcpTool(client, {
      toolName: "mcp.filesystem.read",
      handler: allowHandler
    });
    const resAllow = await wrappedAllow({ path: "/foo/bar" });
    expect(allowHandler).toHaveBeenCalledOnce();
    expect(resAllow.isError).toBe(false);
    expect(resAllow.content).toEqual([{ type: "text", text: "allow-res-/foo/bar" }]);
    expect(events[events.length - 1]?.status).toBe("executed");

    // 2. Log Only
    const logHandler = vi.fn(async () => ({ success: true }));
    const wrappedLog = wrapMcpTool(client, {
      toolName: "mcp.filesystem.read_logged",
      handler: logHandler
    });
    const resLog = await wrappedLog({});
    expect(logHandler).toHaveBeenCalledOnce();
    expect(resLog.isError).toBe(false);
    expect(resLog.content).toEqual([{ type: "text", text: JSON.stringify({ success: true }) }]);
    expect(events[events.length - 1]?.status).toBe("logged");

    // 3. Block
    const blockHandler = vi.fn(async () => "run-output");
    const wrappedBlock = wrapMcpTool(client, {
      toolName: "mcp.shell.run",
      context: { environment: "production" },
      handler: blockHandler
    });
    const resBlock = await wrappedBlock({ cmd: "rm -rf /" });
    expect(blockHandler).not.toHaveBeenCalled();
    expect(resBlock.isError).toBe(true);
    expect(resBlock.content[0]?.text).toContain("Blocked by policy");
    expect(events[events.length - 1]?.status).toBe("blocked");

    // 4. Require Approval
    const approveHandler = vi.fn(async () => "run-output");
    const wrappedApprove = wrapMcpTool(client, {
      toolName: "mcp.filesystem.write",
      handler: approveHandler
    });
    const resApprove = await wrappedApprove({ path: "/safe/app.log" });
    expect(approveHandler).not.toHaveBeenCalled();
    expect(resApprove.isError).toBe(true);
    expect(resApprove.content[0]?.text).toContain("Requires approval");
    expect(events[events.length - 1]?.status).toBe("pending_approval");
  });

  it("observe mode executes handler even when policy would block, and logs observed vs effective decisions", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(observeTestPolicy, createMemoryAuditLogger(events));
    client.agent = "coding-agent";

    const handler = vi.fn(async () => "refund-succeeded");
    const wrapped = wrapMcpTool(client, {
      toolName: "stripe.refund",
      handler
    });

    const result = await wrapped({ amount: 1000 });
    expect(handler).toHaveBeenCalledOnce();
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "refund-succeeded" }]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      status: "decision_logged",
      decision: "allow",
      enforcement_mode: "observe",
      observed_decision: "block",
      effective_decision: "allow",
      shadow: true,
      observe_mode: true
    });
  });

  it("handler errors are logged properly", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(testPolicy, createMemoryAuditLogger(events));
    client.agent = "mcp-agent";

    const handler = vi.fn(async (args: { secret: string; path?: string }) => {
      throw new Error(`failed executing with key: ${args.secret}`);
    });
    const wrapped = wrapMcpTool(client, {
      toolName: "mcp.filesystem.read",
      handler
    });

    const result = await wrapped({ secret: "my-secret-key-123", path: "/foo" });
    expect(handler).toHaveBeenCalledOnce();
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("failed executing with key: my-secret-key-123");

    expect(events).toHaveLength(2);
    expect(events[1]?.status).toBe("failed");
    expect(events[1]?.error).toBe("failed executing with key: my-secret-key-123");
  });

  it("redacts secrets inside audit logs when wrapMcpTool is used", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-mcp-audit-"));
    const auditPath = join(dir, "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath);
    const client = createClient(testPolicy, logger);
    client.agent = "mcp-agent";

    const handler = vi.fn(async () => "success");
    const wrapped = wrapMcpTool(client, {
      toolName: "mcp.filesystem.read",
      handler
    });

    await wrapped({ path: "/foo", secretKey: "sk_live_xyz123" });
    expect(handler).toHaveBeenCalledOnce();

    const contents = await readFile(auditPath, "utf8");
    const firstLine = contents.split("\n")[0] ?? "";
    const parsed = JSON.parse(firstLine);
    expect(parsed.argsRedacted.secretKey).toBe("[REDACTED]");
    expect(parsed.argsRedacted.path).toBe("/foo");
  });
});
