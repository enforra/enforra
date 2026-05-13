import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createLocalAuditLogger,
  redactErrorMessage,
  redactPayload,
  REDACTED_VALUE,
  verifyAuditLog
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

  it("does not add integrity metadata by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath);

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      args: { amount: 20 }
    });

    const contents = await readFile(auditPath, "utf8");
    const event = JSON.parse(contents.trim()) as Record<string, unknown>;
    expect(event.integrity).toBeUndefined();
  });

  it("writes hash-chain integrity metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });

    const first = await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "decision_logged",
      args: { amount: 20 }
    });

    const second = await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      args: { amount: 20 }
    });

    expect(first.integrity).toMatchObject({
      algorithm: "sha256",
      previousHash: null
    });
    expect(first.integrity?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.integrity?.previousHash).toBe(first.integrity?.hash);
    expect(second.integrity?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies an untouched hash-chain audit log", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "decision_logged",
      args: { amount: 20 }
    });
    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      args: { amount: 20 }
    });

    await expect(verifyAuditLog(auditPath)).resolves.toEqual({
      valid: true,
      eventsChecked: 2
    });
  });

  it("detects modified audit event content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      args: { amount: 20 }
    });

    const line = (await readFile(auditPath, "utf8")).trim();
    const event = JSON.parse(line) as { argsRedacted: { amount: number } };
    event.argsRedacted.amount = 999;
    await writeFile(auditPath, `${JSON.stringify(event)}\n`, "utf8");

    await expect(verifyAuditLog(auditPath)).resolves.toMatchObject({
      valid: false,
      eventsChecked: 0,
      firstInvalidLine: 1,
      reason: "audit event hash mismatch"
    });
  });

  it("detects a broken previousHash value", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditPath = join(dir, ".enforra", "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "decision_logged",
      args: { amount: 20 }
    });
    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      args: { amount: 20 }
    });

    const lines = (await readFile(auditPath, "utf8")).trim().split("\n");
    const secondEvent = JSON.parse(lines[1] ?? "{}") as {
      integrity: { previousHash: string };
    };
    secondEvent.integrity.previousHash = "0".repeat(64);
    lines[1] = JSON.stringify(secondEvent);
    await writeFile(auditPath, `${lines.join("\n")}\n`, "utf8");

    await expect(verifyAuditLog(auditPath)).resolves.toMatchObject({
      valid: false,
      eventsChecked: 1,
      firstInvalidLine: 2,
      reason: "broken hash chain"
    });
  });

  it("detects invalid JSON lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditDir = join(dir, ".enforra");
    await mkdir(auditDir, { recursive: true });
    const auditPath = join(auditDir, "audit.jsonl");
    await writeFile(auditPath, "{not-json}\n", "utf8");

    await expect(verifyAuditLog(auditPath)).resolves.toMatchObject({
      valid: false,
      eventsChecked: 0,
      firstInvalidLine: 1,
      reason: "invalid JSON line"
    });
  });

  it("reports non-hash-chain logs as missing integrity metadata", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-audit-"));
    const auditDir = join(dir, ".enforra");
    await mkdir(auditDir, { recursive: true });
    const auditPath = join(auditDir, "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath);

    await logger.append({
      agent: "support-agent",
      tool: "stripe.refund",
      decision: "allow",
      status: "executed",
      args: { amount: 20 }
    });

    await expect(verifyAuditLog(auditPath)).resolves.toMatchObject({
      valid: false,
      eventsChecked: 0,
      firstInvalidLine: 1,
      reason: "audit log does not contain integrity metadata"
    });
  });
});
