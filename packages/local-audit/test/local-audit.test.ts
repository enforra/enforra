import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createLocalAuditLogger, redactPayload, REDACTED_VALUE } from "../src/index.js";

describe("local-audit", () => {
  it("creates the audit file and appends an event", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath);

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      matchedPolicyId: "allow-small-refunds",
      status: "executed",
      args: { amount: 20 }
    });

    const contents = await readFile(auditPath, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      argsRedacted: { amount: 20 }
    });
  });

  it("redacts nested secrets", () => {
    expect(
      redactPayload({
        customerId: "cus_123",
        auth: {
          token: "secret-token",
          password: "pw"
        }
      })
    ).toEqual({
      customerId: "cus_123",
      auth: {
        token: REDACTED_VALUE,
        password: REDACTED_VALUE
      }
    });
  });

  it("redacts secrets inside arrays", () => {
    expect(
      redactPayload({
        recipients: [
          { email: "user@example.com", apiKey: "key" },
          { email: "admin@example.com", privateKey: "private" }
        ]
      })
    ).toEqual({
      recipients: [
        { email: "user@example.com", apiKey: REDACTED_VALUE },
        { email: "admin@example.com", privateKey: REDACTED_VALUE }
      ]
    });
  });

  it("keeps normal fields visible", () => {
    expect(
      redactPayload({
        amount: 20,
        customerId: "cus_123",
        metadata: { reason: "duplicate charge" }
      })
    ).toEqual({
      amount: 20,
      customerId: "cus_123",
      metadata: { reason: "duplicate charge" }
    });
  });
});
