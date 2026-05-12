import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";

const decisions = ["allow", "block", "require_approval", "log_only"] as const;

export type Decision = (typeof decisions)[number];

export interface ToolCallInput {
  agent: string;
  tool: string;
  args: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  decision: Decision;
  matchedPolicyId?: string;
  reason: string;
  evaluatedAt: string;
  policyVersion: 1;
}

export interface FieldCondition {
  field: string;
  value: string | number | boolean;
}

export interface PolicyMatch {
  agent?: string;
  tool?: string;
  args?: {
    amount_gt?: number;
    amount_gte?: number;
    amount_lt?: number;
    amount_lte?: number;
  };
  field_equals?: FieldCondition;
  field_not_equals?: FieldCondition;
  contains?: FieldCondition;
  not_contains?: FieldCondition;
}

export interface PolicyRule {
  id: string;
  description?: string;
  match: PolicyMatch;
  decision: Decision;
}

export interface PolicyFile {
  version: 1;
  defaults?: {
    decision?: Decision;
  };
  policies: PolicyRule[];
}

const fieldConditionSchema = z.object({
  field: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()])
});

const policyMatchSchema = z
  .object({
    agent: z.string().min(1).optional(),
    tool: z.string().min(1).optional(),
    args: z
      .object({
        amount_gt: z.number().optional(),
        amount_gte: z.number().optional(),
        amount_lt: z.number().optional(),
        amount_lte: z.number().optional()
      })
      .strict()
      .optional(),
    field_equals: fieldConditionSchema.optional(),
    field_not_equals: fieldConditionSchema.optional(),
    contains: fieldConditionSchema.optional(),
    not_contains: fieldConditionSchema.optional()
  })
  .strict();

const policyFileSchema = z
  .object({
    version: z.literal(1),
    defaults: z
      .object({
        decision: z.enum(decisions).optional()
      })
      .strict()
      .optional(),
    policies: z.array(
      z
        .object({
          id: z.string().min(1),
          description: z.string().optional(),
          match: policyMatchSchema,
          decision: z.enum(decisions)
        })
        .strict()
    )
  })
  .strict();

export async function loadPolicyFile(path: string): Promise<PolicyFile> {
  const source = await readFile(path, "utf8");
  return parsePolicyYaml(source);
}

export function parsePolicyYaml(source: string): PolicyFile {
  const parsed = YAML.parse(source) as unknown;
  return policyFileSchema.parse(parsed);
}

export function evaluatePolicy(
  policyFile: PolicyFile,
  input: ToolCallInput
): PolicyEvaluationResult {
  const matchedPolicy = policyFile.policies.find((policy) => matchesPolicy(policy.match, input));
  const decision = matchedPolicy?.decision ?? policyFile.defaults?.decision ?? "block";

  return {
    decision,
    matchedPolicyId: matchedPolicy?.id,
    reason: matchedPolicy
      ? `matched policy ${matchedPolicy.id}`
      : `no matching policy; default decision ${decision}`,
    evaluatedAt: new Date().toISOString(),
    policyVersion: policyFile.version
  };
}

function matchesPolicy(match: PolicyMatch, input: ToolCallInput): boolean {
  if (match.agent !== undefined && match.agent !== input.agent) {
    return false;
  }

  if (match.tool !== undefined && match.tool !== input.tool) {
    return false;
  }

  if (match.args !== undefined && !matchesAmountConditions(match.args, input.args.amount)) {
    return false;
  }

  if (match.field_equals !== undefined && !fieldEquals(input, match.field_equals)) {
    return false;
  }

  if (match.field_not_equals !== undefined && fieldEquals(input, match.field_not_equals)) {
    return false;
  }

  if (match.contains !== undefined && !fieldContains(input, match.contains)) {
    return false;
  }

  if (match.not_contains !== undefined && fieldContains(input, match.not_contains)) {
    return false;
  }

  return true;
}

function matchesAmountConditions(
  conditions: NonNullable<PolicyMatch["args"]>,
  amountValue: unknown
): boolean {
  if (
    conditions.amount_gt === undefined &&
    conditions.amount_gte === undefined &&
    conditions.amount_lt === undefined &&
    conditions.amount_lte === undefined
  ) {
    return true;
  }

  if (typeof amountValue !== "number" || Number.isNaN(amountValue)) {
    return false;
  }

  if (conditions.amount_gt !== undefined && !(amountValue > conditions.amount_gt)) {
    return false;
  }

  if (conditions.amount_gte !== undefined && !(amountValue >= conditions.amount_gte)) {
    return false;
  }

  if (conditions.amount_lt !== undefined && !(amountValue < conditions.amount_lt)) {
    return false;
  }

  if (conditions.amount_lte !== undefined && !(amountValue <= conditions.amount_lte)) {
    return false;
  }

  return true;
}

function fieldEquals(input: ToolCallInput, condition: FieldCondition): boolean {
  return getFieldValue(input, condition.field) === condition.value;
}

function fieldContains(input: ToolCallInput, condition: FieldCondition): boolean {
  const actual = getFieldValue(input, condition.field);
  if (typeof actual !== "string") {
    return false;
  }

  return actual.includes(String(condition.value));
}

function getFieldValue(input: ToolCallInput, field: string): unknown {
  if (Object.hasOwn(input.args, field)) {
    return input.args[field];
  }

  if (input.context !== undefined && Object.hasOwn(input.context, field)) {
    return input.context[field];
  }

  return undefined;
}
