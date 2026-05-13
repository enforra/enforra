import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";

const decisions = ["allow", "block", "require_approval", "log_only"] as const;
const operators = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains"] as const;

export type Decision = (typeof decisions)[number];
export type ConditionOperator = (typeof operators)[number];

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

export interface PolicyCheckTrace {
  type: "agent" | "tool" | "condition";
  field: string;
  operator: "eq" | ConditionOperator;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
  reason?: string;
}

export interface PolicyRuleTrace {
  policyId: string;
  matched: boolean;
  checks: PolicyCheckTrace[];
  failureReasons: string[];
}

export interface PolicyEvaluationTrace {
  evaluatedPolicyIds: string[];
  policies: PolicyRuleTrace[];
  finalMatchedPolicyId?: string;
  finalDecision: Decision;
  usedDefaultDecision: boolean;
}

export interface PolicyEvaluationResultWithTrace extends PolicyEvaluationResult {
  trace: PolicyEvaluationTrace;
}

export interface PolicyCondition {
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean;
}

export interface PolicyMatch {
  agent?: string;
  tool?: string;
}

export interface PolicyRule {
  id: string;
  description?: string;
  match: PolicyMatch;
  conditions?: PolicyCondition[];
  decision: Decision;
}

export interface PolicyFile {
  version: 1;
  defaults?: {
    decision?: Decision;
  };
  policies: PolicyRule[];
}

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(operators),
  value: z.union([z.string(), z.number(), z.boolean()])
});

const policyMatchSchema = z
  .object({
    agent: z.string().min(1).optional(),
    tool: z.string().min(1).optional()
  })
  .strict();

const policyRuleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().optional(),
    match: policyMatchSchema,
    conditions: z.array(conditionSchema).min(1).optional(),
    decision: z.enum(decisions)
  })
  .strict()
  .superRefine((rule, context) => {
    if (
      rule.match.agent === undefined &&
      rule.match.tool === undefined &&
      rule.conditions === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "policy rule must include match.agent, match.tool, or conditions",
        path: ["match"]
      });
    }
  });

const policyFileSchema = z
  .object({
    version: z.literal(1),
    defaults: z
      .object({
        decision: z.enum(decisions).optional()
      })
      .strict()
      .optional(),
    policies: z.array(policyRuleSchema)
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
  const matchedPolicy = policyFile.policies.find(
    (policy) => tracePolicyRule(policy, input).matched
  );
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

export function evaluatePolicyWithTrace(
  policyFile: PolicyFile,
  input: ToolCallInput
): PolicyEvaluationResultWithTrace {
  const policyTraces: PolicyRuleTrace[] = [];
  let matchedPolicy: PolicyRule | undefined;

  for (const policy of policyFile.policies) {
    const policyTrace = tracePolicyRule(policy, input);
    policyTraces.push(policyTrace);

    if (policyTrace.matched) {
      matchedPolicy = policy;
      break;
    }
  }

  const decision = matchedPolicy?.decision ?? policyFile.defaults?.decision ?? "block";
  const evaluatedAt = new Date().toISOString();

  return {
    decision,
    matchedPolicyId: matchedPolicy?.id,
    reason: matchedPolicy
      ? `matched policy ${matchedPolicy.id}`
      : `no matching policy; default decision ${decision}`,
    evaluatedAt,
    policyVersion: policyFile.version,
    trace: {
      evaluatedPolicyIds: policyTraces.map((policyTrace) => policyTrace.policyId),
      policies: policyTraces,
      finalMatchedPolicyId: matchedPolicy?.id,
      finalDecision: decision,
      usedDefaultDecision: matchedPolicy === undefined
    }
  };
}

function tracePolicyRule(policy: PolicyRule, input: ToolCallInput): PolicyRuleTrace {
  const checks = [
    ...traceMatchChecks(policy.match, input),
    ...traceConditionChecks(policy.conditions, input)
  ];
  const failureReasons = checks
    .filter((check) => !check.passed)
    .map((check) => check.reason ?? `${check.field} did not match`);

  return {
    policyId: policy.id,
    matched: checks.every((check) => check.passed),
    checks,
    failureReasons
  };
}

function traceMatchChecks(match: PolicyMatch, input: ToolCallInput): PolicyCheckTrace[] {
  const checks: PolicyCheckTrace[] = [];

  if (match.agent !== undefined) {
    const passed = input.agent === match.agent;
    checks.push({
      type: "agent",
      field: "agent",
      operator: "eq",
      expectedValue: match.agent,
      actualValue: input.agent,
      passed,
      reason: passed ? undefined : `agent expected ${match.agent}, received ${input.agent}`
    });
  }

  if (match.tool !== undefined) {
    const passed = input.tool === match.tool;
    checks.push({
      type: "tool",
      field: "tool",
      operator: "eq",
      expectedValue: match.tool,
      actualValue: input.tool,
      passed,
      reason: passed ? undefined : `tool expected ${match.tool}, received ${input.tool}`
    });
  }

  return checks;
}

function traceConditionChecks(
  conditions: PolicyCondition[] | undefined,
  input: ToolCallInput
): PolicyCheckTrace[] {
  return conditions?.map((condition) => traceConditionCheck(condition, input)) ?? [];
}

function traceConditionCheck(condition: PolicyCondition, input: ToolCallInput): PolicyCheckTrace {
  const actualValue = getPathValue(input, condition.field);
  const passed = evaluateCondition(condition, actualValue);

  return {
    type: "condition",
    field: condition.field,
    operator: condition.operator,
    expectedValue: condition.value,
    actualValue,
    passed,
    reason: passed
      ? undefined
      : `${condition.field} ${condition.operator} ${String(
          condition.value
        )} failed; actual ${String(actualValue)}`
  };
}

function evaluateCondition(condition: PolicyCondition, actual: unknown): boolean {
  if (actual === undefined) {
    return false;
  }

  switch (condition.operator) {
    case "eq":
      return actual === condition.value;
    case "neq":
      return actual !== condition.value;
    case "gt":
      return compareNumbers(actual, condition.value, (left, right) => left > right);
    case "gte":
      return compareNumbers(actual, condition.value, (left, right) => left >= right);
    case "lt":
      return compareNumbers(actual, condition.value, (left, right) => left < right);
    case "lte":
      return compareNumbers(actual, condition.value, (left, right) => left <= right);
    case "contains":
      return typeof actual === "string" && actual.includes(String(condition.value));
    case "not_contains":
      return typeof actual === "string" && !actual.includes(String(condition.value));
  }
}

function compareNumbers(
  actual: unknown,
  expected: string | number | boolean,
  compare: (left: number, right: number) => boolean
): boolean {
  if (
    typeof actual !== "number" ||
    typeof expected !== "number" ||
    Number.isNaN(actual) ||
    Number.isNaN(expected)
  ) {
    return false;
  }

  return compare(actual, expected);
}

function getPathValue(input: ToolCallInput, field: string): unknown {
  const [root, ...path] = field.split(".");
  if (path.length === 0) {
    return undefined;
  }

  const rootValue = root === "args" ? input.args : root === "context" ? input.context : undefined;
  return path.reduce<unknown>((current, segment) => {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }

    return current[segment];
  }, rootValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
