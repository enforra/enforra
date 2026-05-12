import { describe, expect, it, vi } from "vitest";
import type { AuditEventInput, LocalAuditLogger } from "@enforra/local-audit";
import { createClient } from "../src/index.js";

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
});
