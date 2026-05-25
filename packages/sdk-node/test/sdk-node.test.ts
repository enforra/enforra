import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AuditEventInput, LocalAuditLogger } from "@enforra/local-audit";
import type { PolicyFile } from "@enforra/policy-core";
import { createClient, createEnforraClient } from "../src/index.js";

function createMemoryAuditLogger(events: AuditEventInput[]): LocalAuditLogger {
  return {
    async append(event: AuditEventInput) {
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

function createFailingAuditLogger(): LocalAuditLogger {
  return {
    async append() {
      throw new Error("audit write failed");
    }
  };
}

function createAuditLoggerFailingOnCall(failingCall: number): LocalAuditLogger {
  let calls = 0;
  return {
    async append(event: AuditEventInput) {
      calls += 1;
      if (calls === failingCall) {
        throw new Error("audit write failed");
      }

      return {
        id: `audit-${calls}`,
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

const policyFile: PolicyFile = {
  version: 1,
  defaults: { decision: "block" },
  policies: [
    {
      id: "allow-small-refunds",
      match: { agent: "support-agent", tool: "stripe.refund" },
      conditions: [{ field: "args.amount", operator: "lte", value: 50 }],
      decision: "allow"
    },
    {
      id: "approve-medium-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund"
      },
      conditions: [
        { field: "args.amount", operator: "gt", value: 50 },
        { field: "args.amount", operator: "lte", value: 500 }
      ],
      decision: "require_approval"
    },
    {
      id: "log-health-checks",
      match: { agent: "support-agent", tool: "health.check" },
      decision: "log_only"
    }
  ]
};

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
    expect(events.map((event) => event.status)).toEqual(["decision_logged", "executed"]);
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

  it("returns a typed audit failure when blocked audit logging fails", async () => {
    const client = createClient(policyFile, createFailingAuditLogger());
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
      blocked: true,
      auditFailed: true
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.message).toBe("audit write failed");
    }
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

  it("returns a typed audit failure when approval audit logging fails", async () => {
    const client = createClient(policyFile, createFailingAuditLogger());
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
      approvalRequired: true,
      auditFailed: true
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.message).toBe("audit write failed");
    }
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
    expect(events.map((event) => event.status)).toEqual(["decision_logged", "logged"]);
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
      status: "decision_logged"
    });
    expect(events[1]).toMatchObject({
      status: "failed",
      error: "refund failed"
    });
  });

  it("preserves execution errors when failed audit logging also fails", async () => {
    const client = createClient(policyFile, createAuditLoggerFailingOnCall(2));

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
      executed: true,
      auditFailed: true
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.message).toBe("refund failed");
    }
  });

  it("returns execution data when post-execution audit logging fails", async () => {
    const client = createClient(policyFile, createAuditLoggerFailingOnCall(2));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 },
      execute: async () => ({ refundId: "ref_123", status: "created" })
    });

    expect(result).toMatchObject({
      ok: false,
      decision: "allow",
      executed: true,
      auditFailed: true,
      data: { refundId: "ref_123", status: "created" }
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.message).toBe("audit write failed");
    }
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
    expect(events[0]?.status).toBe("decision_logged");
  });

  it("does not execute allowed callbacks when pre-execution audit logging fails", async () => {
    const client = createClient(policyFile, createFailingAuditLogger());
    const execute = vi.fn(async () => ({ refunded: true }));

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 },
      execute
    });

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      decision: "allow",
      executed: false,
      auditFailed: true
    });
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
    conditions:
      - field: args.accountId
        operator: eq
        value: acct_123
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
    expect(auditLines).toHaveLength(3);
    expect(JSON.parse(auditLines[0] ?? "{}")).toMatchObject({
      tool: "crm.lookup",
      status: "decision_logged"
    });
    expect(JSON.parse(auditLines[1] ?? "{}")).toMatchObject({
      tool: "crm.lookup",
      status: "executed"
    });
    expect(JSON.parse(auditLines[2] ?? "{}")).toMatchObject({
      tool: "crm.delete",
      status: "blocked"
    });
  });

  it("redacts secrets from audit log but returns original error to caller on failed execution", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));
    const secretKey = "sk_live_1234567890abcdef";
    const bearerToken = "Bearer ya29.Gl0zBL_abcdefghijklmnopqrstuvwxyz";
    const apiKey = "api_key=secret-api-key";
    const password = "password=super-secret-password";

    const errorMessage = `Failed to call API: ${secretKey}, ${bearerToken}, ${apiKey}, ${password}`;

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 },
      execute: async () => {
        throw new Error(errorMessage);
      }
    });

    // 1. enforceToolCall returns the original Error object or original error message to the caller
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.message).toBe(errorMessage);
      expect(result.error?.message).toContain(secretKey);
    }

    // 2. the tool call result keeps executed: true
    expect(result.executed).toBe(true);

    // 3. the decision is allow or log_only depending on the test policy
    expect(result.decision).toBe("allow");

    // 4. the audit log writes a redacted error message
    expect(events[1]?.status).toBe("failed");
    expect(events[1]?.error).not.toBe(errorMessage);
    expect(events[1]?.error).toContain("[REDACTED]");

    // 5. the audit log does not contain the raw secret
    expect(events[1]?.error).not.toContain(secretKey);
    expect(events[1]?.error).not.toContain("ya29.Gl0zBL");
    expect(events[1]?.error).not.toContain("secret-api-key");
    expect(events[1]?.error).not.toContain("super-secret-password");
  });

  it("redacts secrets from audit log for log_only decision on failed execution", async () => {
    const events: AuditEventInput[] = [];
    const client = createClient(policyFile, createMemoryAuditLogger(events));
    const secretKey = "sk_test_4eC39HqLyjWDarjtT1zdp7dc";

    const result = await client.enforceToolCall({
      agent: "support-agent",
      tool: "health.check",
      args: {},
      execute: async () => {
        throw new Error(`Auth failed with ${secretKey}`);
      }
    });

    expect(result.decision).toBe("log_only");
    expect(result.executed).toBe(true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error?.message).toContain(secretKey);
    }

    expect(events[1]?.status).toBe("failed");
    expect(events[1]?.error).toBe("Auth failed with [REDACTED]");
    expect(events[1]?.error).not.toContain(secretKey);
  });

  it("writes integrity metadata when auditIntegrity is hash_chain", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-sdk-"));
    const policyPath = join(dir, "policy.yaml");
    const auditPath = join(dir, ".enforra", "audit.jsonl");

    await writeFile(
      policyPath,
      `
version: 1
defaults:
  decision: block
policies:
  - id: allow-lookup
    match:
      agent: research-agent
      tool: crm.lookup
    decision: allow
`,
      "utf8"
    );

    const client = await createEnforraClient({
      policyPath,
      auditPath,
      auditIntegrity: "hash_chain"
    });

    await client.enforceToolCall({
      agent: "research-agent",
      tool: "crm.lookup",
      args: { accountId: "acct_123" },
      execute: async () => ({ accountId: "acct_123" })
    });

    const lines = (await readFile(auditPath, "utf8")).trim().split("\n");
    const firstEvent = JSON.parse(lines[0] ?? "{}") as {
      integrity?: { previousHash: string | null; hash: string };
    };
    const secondEvent = JSON.parse(lines[1] ?? "{}") as {
      integrity?: { previousHash: string | null; hash: string };
    };

    expect(firstEvent.integrity?.previousHash).toBeNull();
    expect(firstEvent.integrity?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondEvent.integrity?.previousHash).toBe(firstEvent.integrity?.hash);
  });

  it("executes callbacks and logs observe mode audit fields when mode is observe", async () => {
    const observePolicy: PolicyFile = {
      version: 1,
      mode: "observe" as const,
      defaults: { decision: "block" as const },
      policies: [
        {
          id: "block-large-refunds",
          match: { agent: "support-agent", tool: "stripe.refund" },
          conditions: [{ field: "args.amount", operator: "gt", value: 500 }],
          decision: "block" as const
        },
        {
          id: "approve-medium-refunds",
          match: { agent: "support-agent", tool: "stripe.refund" },
          conditions: [
            { field: "args.amount", operator: "gt", value: 50 },
            { field: "args.amount", operator: "lte", value: 500 }
          ],
          decision: "require_approval" as const
        }
      ]
    };

    const events: AuditEventInput[] = [];
    const client = createClient(observePolicy, createMemoryAuditLogger(events));
    const execute = vi.fn(async () => ({ refunded: true }));

    // Normally blocked refund
    const resultBlock = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 1000 },
      execute
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(resultBlock).toMatchObject({
      ok: true,
      decision: "allow",
      executed: true,
      matchedPolicyId: "block-large-refunds"
    });

    // Check events
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
    expect(events[1]).toMatchObject({
      status: "executed",
      decision: "allow",
      enforcement_mode: "observe",
      observed_decision: "block",
      effective_decision: "allow",
      shadow: true,
      observe_mode: true
    });

    // Normally approval required refund
    execute.mockClear();
    events.length = 0;
    const resultApprove = await client.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 250 },
      execute
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(resultApprove).toMatchObject({
      ok: true,
      decision: "allow",
      executed: true,
      matchedPolicyId: "approve-medium-refunds"
    });

    expect(events[0]).toMatchObject({
      status: "decision_logged",
      decision: "allow",
      enforcement_mode: "observe",
      observed_decision: "require_approval",
      effective_decision: "allow",
      shadow: true,
      observe_mode: true
    });
  });
});
