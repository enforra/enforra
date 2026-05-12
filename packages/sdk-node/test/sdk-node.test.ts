import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AuditEventInput, LocalAuditLogger } from "@enforra/local-audit";
import { createClient, createEnforraClient } from "../src/index.js";

function createMemoryAuditLogger(events: AuditEventInput[]): LocalAuditLogger {
  return {
    async append(event) {
      events.push(event);
      return {
        id: "audit-1",
        timestamp: "2026-05-12T00:00:00.000Z",
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

const policyFile = {
  version: 1,
  defaults: { decision: "block" },
  policies: [
    {
      id: "allow-small-refunds",
      match: { agent: "support-agent", tool: "stripe.refund", args: { amount_lte: 50 } },
      decision: "allow"
    },
    {
      id: "approve-medium-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund",
        args: { amount_gt: 50, amount_lte: 500 }
      },
      decision: "require_approval"
    },
    {
      id: "log-health-checks",
      match: { agent: "support-agent", tool: "health.check" },
      decision: "log_only"
    }
  ]
} as const;

describe("sdk-node", () => {
  it("executes callback when allowed", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => ({ refunded: true }));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 },
      execute
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      decision: "allow",
      executed: true,
      matchedPolicyId: "allow-small-refunds"
    });
    expect(events[0]?.status).toBe("executed");
  });

  it("does not execute callback when blocked", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => ({ refunded: true }));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 1000 },
      execute
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      decision: "block",
      executed: false,
      blocked: true
    });
    expect(events[0]?.status).toBe("blocked");
  });

  it("does not execute callback when approval is required", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => ({ refunded: true }));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 250 },
      execute
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      decision: "require_approval",
      executed: false,
      approvalRequired: true
    });
    expect(events[0]?.status).toBe("pending_approval");
  });

  it("executes callback for log_only", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => ({ ok: true }));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "health.check",
      args: {},
      execute
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: true, decision: "log_only", executed: true });
    expect(events[0]?.status).toBe("logged");
  });

  it("logs failed execution", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 },
      execute: async () => {
        throw new Error("refund failed");
      }
    });

    expect(result).toMatchObject({
      ok: false,
      decision: "allow",
      executed: true
    });
    expect(events[0]).toMatchObject({
      status: "failed",
      error: "refund failed"
    });
  });

  it("includes the matched policy id", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 },
      execute: async () => ({ refunded: true })
    });

    expect(result.matchedPolicyId).toBe("allow-small-refunds");
    expect(events[0]?.matchedPolicyId).toBe("allow-small-refunds");
  });

  it("loads a custom YAML policy path without requiring starter policies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-sdk-"));
    const policyPath = join(dir, "research-policy.yaml");
    const auditPath = join(dir, "audit.jsonl");

    await writeFile(
      policyPath,
      `
version: 1
defaults:
  decision: block
policies:
  - id: allow-crm-lookup
    description: Allow read-only account lookup
    match:
      agent: research-agent
      tool: crm.lookup
    decision: allow
`,
      "utf8"
    );

    const client = await createEnforraClient({ policyPath, auditPath });
    const executeLookup = vi.fn(async () => ({ accountId: "acct_123" }));
    const executeDelete = vi.fn(async () => ({ deleted: true }));

    const allowedResult = await client.enforceToolCall({
      agent: "research-agent",
      tool: "crm.lookup",
      args: { accountId: "acct_123" },
      execute: executeLookup
    });

    const blockedResult = await client.enforceToolCall({
      agent: "research-agent",
      tool: "crm.delete",
      args: { accountId: "acct_123" },
      execute: executeDelete
    });

    expect(executeLookup).toHaveBeenCalledOnce();
    expect(executeDelete).not.toHaveBeenCalled();
    expect(allowedResult).toMatchObject({
      ok: true,
      decision: "allow",
      matchedPolicyId: "allow-crm-lookup",
      executed: true
    });
    expect(blockedResult).toMatchObject({
      ok: false,
      decision: "block",
      executed: false,
      blocked: true
    });

    const auditLines = (await readFile(auditPath, "utf8")).trim().split("\n");
    expect(auditLines).toHaveLength(2);
    expect(JSON.parse(auditLines[0] ?? "{}")).toMatchObject({
      tool: "crm.lookup",
      status: "executed"
    });
    expect(JSON.parse(auditLines[1] ?? "{}")).toMatchObject({
      tool: "crm.delete",
      status: "blocked"
    });
  });
});
