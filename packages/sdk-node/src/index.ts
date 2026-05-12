import { performance } from "node:perf_hooks";
import {
  createLocalAuditLogger,
  redactErrorMessage,
  type LocalAuditLogger
} from "@enforra/local-audit";
import {
  evaluatePolicy,
  loadPolicyFile,
  type Decision,
  type PolicyFile,
  type ToolCallInput
} from "@enforra/policy-core";

export interface CreateEnforraClientOptions {
  policyPath: string;
  auditPath?: string;
}

export interface EnforceToolCallInput<TData> extends ToolCallInput {
  execute: () => Promise<TData>;
}

export type EnforceToolCallResult<TData> =
  | {
      ok: true;
      decision: "allow" | "log_only";
      matchedPolicyId?: string;
      reason: string;
      executed: true;
      data: TData;
    }
  | {
      ok: false;
      decision: "block";
      matchedPolicyId?: string;
      reason: string;
      executed: false;
      blocked: true;
      auditFailed?: true;
      error?: Error;
    }
  | {
      ok: false;
      decision: "require_approval";
      matchedPolicyId?: string;
      reason: string;
      executed: false;
      approvalRequired: true;
      auditFailed?: true;
      error?: Error;
    }
  | {
      ok: false;
      decision: Decision;
      matchedPolicyId?: string;
      reason: string;
      executed: true;
      auditFailed?: true;
      error: Error;
    }
  | {
      ok: false;
      decision: "allow" | "log_only";
      matchedPolicyId?: string;
      reason: string;
      executed: true;
      auditFailed: true;
      data: TData;
      error: Error;
    }
  | {
      ok: false;
      decision: "allow" | "log_only";
      matchedPolicyId?: string;
      reason: string;
      executed: false;
      auditFailed: true;
      error: Error;
    };

export interface EnforraClient {
  enforceToolCall<TData>(input: EnforceToolCallInput<TData>): Promise<EnforceToolCallResult<TData>>;
}

export async function createEnforraClient(
  options: CreateEnforraClientOptions
): Promise<EnforraClient> {
  const policyFile = await loadPolicyFile(options.policyPath);
  const auditLogger = createLocalAuditLogger(options.auditPath);

  return createClient(policyFile, auditLogger);
}

export function createClient(policyFile: PolicyFile, auditLogger: LocalAuditLogger): EnforraClient {
  return {
    async enforceToolCall<TData>(
      input: EnforceToolCallInput<TData>
    ): Promise<EnforceToolCallResult<TData>> {
      const startedAt = performance.now();
      const evaluation = evaluatePolicy(policyFile, input);

      if (evaluation.decision === "block") {
        try {
          await auditLogger.append({
            ...auditFields(input, evaluation.decision, evaluation.matchedPolicyId),
            status: "blocked",
            durationMs: durationSince(startedAt)
          });
        } catch (error) {
          return {
            ok: false,
            decision: "block",
            matchedPolicyId: evaluation.matchedPolicyId,
            reason: evaluation.reason,
            executed: false,
            blocked: true,
            auditFailed: true,
            error: normalizeError(error)
          };
        }

        return {
          ok: false,
          decision: "block",
          matchedPolicyId: evaluation.matchedPolicyId,
          reason: evaluation.reason,
          executed: false,
          blocked: true
        };
      }

      if (evaluation.decision === "require_approval") {
        try {
          await auditLogger.append({
            ...auditFields(input, evaluation.decision, evaluation.matchedPolicyId),
            status: "pending_approval",
            durationMs: durationSince(startedAt)
          });
        } catch (error) {
          return {
            ok: false,
            decision: "require_approval",
            matchedPolicyId: evaluation.matchedPolicyId,
            reason: evaluation.reason,
            executed: false,
            approvalRequired: true,
            auditFailed: true,
            error: normalizeError(error)
          };
        }

        return {
          ok: false,
          decision: "require_approval",
          matchedPolicyId: evaluation.matchedPolicyId,
          reason: evaluation.reason,
          executed: false,
          approvalRequired: true
        };
      }

      try {
        await auditLogger.append({
          ...auditFields(input, evaluation.decision, evaluation.matchedPolicyId),
          status: "decision_logged",
          durationMs: durationSince(startedAt)
        });
      } catch (error) {
        return {
          ok: false,
          decision: evaluation.decision,
          matchedPolicyId: evaluation.matchedPolicyId,
          reason: evaluation.reason,
          executed: false,
          auditFailed: true,
          error: normalizeError(error)
        };
      }

      try {
        const data = await input.execute();

        try {
          await auditLogger.append({
            ...auditFields(input, evaluation.decision, evaluation.matchedPolicyId),
            status: evaluation.decision === "log_only" ? "logged" : "executed",
            durationMs: durationSince(startedAt)
          });
        } catch (error) {
          return {
            ok: false,
            decision: evaluation.decision,
            matchedPolicyId: evaluation.matchedPolicyId,
            reason: evaluation.reason,
            executed: true,
            auditFailed: true,
            data,
            error: normalizeError(error)
          };
        }

        return {
          ok: true,
          decision: evaluation.decision,
          matchedPolicyId: evaluation.matchedPolicyId,
          reason: evaluation.reason,
          executed: true,
          data
        };
      } catch (error) {
        const normalizedError = normalizeError(error);
        try {
          await auditLogger.append({
            ...auditFields(input, evaluation.decision, evaluation.matchedPolicyId),
            status: "failed",
            durationMs: durationSince(startedAt),
            error: redactErrorMessage(normalizedError.message)
          });
        } catch {
          return {
            ok: false,
            decision: evaluation.decision,
            matchedPolicyId: evaluation.matchedPolicyId,
            reason: evaluation.reason,
            executed: true,
            auditFailed: true,
            error: normalizedError
          };
        }

        return {
          ok: false,
          decision: evaluation.decision,
          matchedPolicyId: evaluation.matchedPolicyId,
          reason: evaluation.reason,
          executed: true,
          error: normalizedError
        };
      }
    }
  };
}

function auditFields(
  input: ToolCallInput,
  decision: Decision,
  matchedPolicyId: string | undefined
) {
  return {
    agent: input.agent,
    tool: input.tool,
    decision,
    matchedPolicyId,
    args: input.args,
    context: input.context
  };
}

function durationSince(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
