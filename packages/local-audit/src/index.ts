import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
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

export type AuditIntegrityMode = "none" | "hash_chain";

export interface LocalAuditLoggerOptions {
  integrity?: AuditIntegrityMode;
}

export interface AuditEventIntegrity {
  algorithm: "sha256";
  previousHash: string | null;
  hash: string;
}

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
  enforcement_mode?: "enforce" | "observe";
  observed_decision?: Decision;
  effective_decision?: Decision;
  shadow?: boolean;
  observe_mode?: boolean;
}

export type AuditEvent = {
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
  integrity?: AuditEventIntegrity;
  enforcement_mode?: "enforce" | "observe";
  observed_decision?: Decision;
  effective_decision?: Decision;
  shadow?: boolean;
  observe_mode?: boolean;
};

export interface LocalAuditLogger {
  append(event: AuditEventInput): Promise<AuditEvent>;
}

export interface AuditVerificationResult {
  valid: boolean;
  eventsChecked: number;
  firstInvalidLine?: number;
  reason?: string;
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

export function createLocalAuditLogger(
  path = ".enforra/audit.jsonl",
  options: LocalAuditLoggerOptions = {}
): LocalAuditLogger {
  const integrity = options.integrity ?? "none";

  return {
    async append(event: AuditEventInput): Promise<AuditEvent> {
      await mkdir(dirname(path), { recursive: true });

      const auditEventBase: AuditEvent = {
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
        error: event.error === undefined ? undefined : redactErrorMessage(event.error),
        enforcement_mode: event.enforcement_mode,
        observed_decision: event.observed_decision,
        effective_decision: event.effective_decision,
        shadow: event.shadow,
        observe_mode: event.observe_mode
      };

      const auditEvent =
        integrity === "hash_chain"
          ? await addHashChainIntegrity(path, auditEventBase)
          : auditEventBase;

      await appendFile(path, `${JSON.stringify(auditEvent)}\n`, "utf8");
      return auditEvent;
    }
  };
}

export async function verifyAuditLog(path: string): Promise<AuditVerificationResult> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    return {
      valid: false,
      eventsChecked: 0,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let previousHash: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index] ?? "");
    } catch {
      return {
        valid: false,
        eventsChecked: index,
        firstInvalidLine: lineNumber,
        reason: "invalid JSON line"
      };
    }

    if (!isPlainObject(parsed)) {
      return {
        valid: false,
        eventsChecked: index,
        firstInvalidLine: lineNumber,
        reason: "audit event is not a JSON object"
      };
    }

    const integrity = parsed.integrity;
    if (!isAuditEventIntegrity(integrity)) {
      return {
        valid: false,
        eventsChecked: index,
        firstInvalidLine: lineNumber,
        reason: "audit log does not contain integrity metadata"
      };
    }

    if (integrity.previousHash !== previousHash) {
      return {
        valid: false,
        eventsChecked: index,
        firstInvalidLine: lineNumber,
        reason: "broken hash chain"
      };
    }

    const expectedHash = computeAuditHash(parsed, integrity.previousHash);
    if (integrity.hash !== expectedHash) {
      return {
        valid: false,
        eventsChecked: index,
        firstInvalidLine: lineNumber,
        reason: "audit event hash mismatch"
      };
    }

    previousHash = integrity.hash;
  }

  return {
    valid: true,
    eventsChecked: lines.length
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

async function addHashChainIntegrity(path: string, event: AuditEvent): Promise<AuditEvent> {
  const previousHash = await readLastIntegrityHash(path);
  const hash = computeAuditHash(event, previousHash);

  return {
    ...event,
    integrity: {
      algorithm: "sha256",
      previousHash,
      hash
    }
  };
}

async function readLastIntegrityHash(path: string): Promise<string | null> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return null;
  }

  const lastLine = lines[lines.length - 1];
  const parsed = JSON.parse(lastLine ?? "");
  if (!isPlainObject(parsed) || !isAuditEventIntegrity(parsed.integrity)) {
    throw new Error("existing audit log does not contain integrity metadata");
  }

  return parsed.integrity.hash;
}

function computeAuditHash(event: Record<string, unknown>, previousHash: string | null): string {
  const eventForHash = {
    ...event,
    integrity: {
      algorithm: "sha256",
      previousHash
    }
  };

  return createHash("sha256").update(stableStringify(eventForHash)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

function toCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalValue(item));
  }

  if (isPlainObject(value)) {
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const nestedValue = value[key];
      if (nestedValue !== undefined && key !== "hash") {
        canonical[key] = toCanonicalValue(nestedValue);
      }
    }
    return canonical;
  }

  return value;
}

function isAuditEventIntegrity(value: unknown): value is AuditEventIntegrity {
  return (
    isPlainObject(value) &&
    value.algorithm === "sha256" &&
    (typeof value.previousHash === "string" || value.previousHash === null) &&
    typeof value.hash === "string"
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
