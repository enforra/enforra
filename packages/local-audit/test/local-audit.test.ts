import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createLocalAuditLogger,
  redactErrorMessage,
  redactPayload,
  REDACTED_VALUE
} from "../src/index.js";

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

  it("redacts secret keys case-insensitively and across common key formats", () => {
    expect(
      redactPayload({
        Authorization: "Bearer abc",
        access_token: "access",
        refresh_token: "refresh",
        client_secret: "client",
        set_cookie: "cookie",
        private_key: "private",
        nestedApiKeyValue: "nested",
        serviceToken: "token",
        normal: "visible"
      })
    ).toEqual({
      Authorization: REDACTED_VALUE,
      access_token: REDACTED_VALUE,
      refresh_token: REDACTED_VALUE,
      client_secret: REDACTED_VALUE,
      set_cookie: REDACTED_VALUE,
      private_key: REDACTED_VALUE,
      nestedApiKeyValue: REDACTED_VALUE,
      serviceToken: REDACTED_VALUE,
      normal: "visible"
    });
  });

  it("redacts common secret patterns in error messages", () => {
    const redacted = redactErrorMessage(
      "request failed Authorization=Bearer abc token=tok_123 api_key=key_123 apikey=key_456 password=pw secret=s1 key sk_live_123"
    );

    expect(redacted).toContain(`Authorization=${REDACTED_VALUE}`);
    expect(redacted).toContain(`token=${REDACTED_VALUE}`);
    expect(redacted).toContain(`api_key=${REDACTED_VALUE}`);
    expect(redacted).toContain(`apikey=${REDACTED_VALUE}`);
    expect(redacted).toContain(`password=${REDACTED_VALUE}`);
    expect(redacted).toContain(`secret=${REDACTED_VALUE}`);
    expect(redacted).not.toContain("Bearer abc");
    expect(redacted).not.toContain("tok_123");
    expect(redacted).not.toContain("key_123");
    expect(redacted).not.toContain("key_456");
    expect(redacted).not.toContain("sk_live_123");
  });

  it("redacts audit event error messages before writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath);

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "failed",
      args: { amount: 20 },
      error: "failed with Bearer abc and password=pw"
    });

    const contents = await readFile(auditPath, "utf8");
    expect(contents).toContain(REDACTED_VALUE);
    expect(contents).not.toContain("Bearer abc");
    expect(contents).not.toContain("password=pw");
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
