import { mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Decision } from "@enforra/policy-core";

export const REDACTED_VALUE = "[REDACTED]";

export const auditStatuses = [
  "decision_logged",
  "executed",
  "blocked",
  "pending_approval",
  "failed",
  "logged"
] as const;

export type AuditStatus = (typeof auditStatuses)[number];

export interface AuditEventInput {
  agent: string;
  tool: string;
  decision: Decision;
  matchedPolicyId?: string;
  status: AuditStatus;
  args: Record<string, unknown>;
  context?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  agent: string;
  tool: string;
  decision: Decision;
  matchedPolicyId?: string;
  status: AuditStatus;
  argsRedacted: unknown;
  contextRedacted?: unknown;
  durationMs?: number;
  error?: string;
}

export interface LocalAuditLogger {
  append(event: AuditEventInput): Promise<AuditEvent>;
}

const sensitiveKeys = new Set([
  "password",
  "pass",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "apikey",
  "secret",
  "clientSecret",
  "authorization",
  "cookie",
  "setCookie",
  "privateKey"
]);

const sensitiveKeyFragments = [
  "token",
  "secret",
  "password",
  "apikey",
  "authorization",
  "privatekey"
];

const errorRedactionPatterns = [
  /\bBearer\s+[-._~+/A-Za-z0-9]+=*/gi,
  /\b(token|api_key|apikey|authorization|password|secret)=([^&\s]+)/gi,
  /\bsk_[A-Za-z0-9_=-]+/g
];

export function createLocalAuditLogger(path = ".enforra/audit.jsonl"): LocalAuditLogger {
  return {
    async append(event: AuditEventInput): Promise<AuditEvent> {
      await mkdir(dirname(path), { recursive: true });

      const auditEvent: AuditEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        agent: event.agent,
        tool: event.tool,
        decision: event.decision,
        matchedPolicyId: event.matchedPolicyId,
        status: event.status,
        argsRedacted: redactPayload(event.args),
        contextRedacted: event.context === undefined ? undefined : redactPayload(event.context),
        durationMs: event.durationMs,
        error: event.error === undefined ? undefined : redactErrorMessage(event.error)
      };

      await appendFile(path, `${JSON.stringify(auditEvent)}\n`, "utf8");
      return auditEvent;
    }
  };
}

export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactPayload(item));
  }

  if (isPlainObject(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = shouldRedactKey(key) ? REDACTED_VALUE : redactPayload(nestedValue);
    }
    return redacted;
  }

  return value;
}

export function redactErrorMessage(message: string): string {
  return errorRedactionPatterns.reduce(
    (redactedMessage, pattern) =>
      redactedMessage.replace(pattern, (match: string, ...args: (string | number)[]) => {
        const p1 = args[0];
        if (typeof p1 === "string") {
          return `${p1}=${REDACTED_VALUE}`;
        }

        return REDACTED_VALUE;
      }),
    message
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
  const normalizedKey = normalizeKey(key);
  if ([...sensitiveKeys].some((sensitiveKey) => normalizeKey(sensitiveKey) === normalizedKey)) {
    return true;
  }

  return sensitiveKeyFragments.some((fragment) => normalizedKey.includes(fragment));
}

function normalizeKey(key: string): string {
  return key.replace(/[-_\s]/g, "").toLowerCase();
}
