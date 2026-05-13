import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";

const decisions = ["allow", "block", "require_approval", "log_only"] as const;
const operators = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains"] as const;

export type Decision = (typeof decisions)[number];
export type ConditionOperator = (typeof operators)[number];
export type PolicyConditionGroupOperator = "all" | "any";

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
  type: "agent" | "tool" | "condition" | "condition_group";
  field: string;
  operator: "eq" | ConditionOperator | PolicyConditionGroupOperator;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
  reason?: string;
  group?: PolicyConditionGroupOperator;
}

export interface PolicyRuleTrace {
  policyId: string;
  priority?: number;
  matched: boolean;
  checks: PolicyCheckTrace[];
  failureReasons: string[];
}

export interface PolicyEvaluationOrderEntry {
  policyId: string;
  priority?: number;
}

export interface PolicyEvaluationTrace {
  evaluatedPolicyIds: string[];
  evaluationOrder: PolicyEvaluationOrderEntry[];
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

export interface PolicyConditionGroup {
  all?: PolicyCondition[];
  any?: PolicyCondition[];
}

export interface PolicyMatch {
  agent?: string;
  tool?: string;
}

export interface PolicyRule {
  id: string;
  description?: string;
  priority?: number;
  match: PolicyMatch;
  conditions?: PolicyCondition[] | PolicyConditionGroup;
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

const conditionGroupSchema = z
  .object({
    all: z.array(conditionSchema).min(1).optional(),
    any: z.array(conditionSchema).min(1).optional()
  })
  .strict()
  .superRefine((group, context) => {
    if (group.all === undefined && group.any === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "condition group must include all or any"
      });
    }
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
    priority: z.number().int().positive().optional(),
    match: policyMatchSchema,
    conditions: z.union([z.array(conditionSchema).min(1), conditionGroupSchema]).optional(),
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
  const matchedPolicy = getPoliciesInEvaluationOrder(policyFile.policies).find(
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
  const policiesInEvaluationOrder = getPoliciesInEvaluationOrder(policyFile.policies);

  for (const policy of policiesInEvaluationOrder) {
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
      evaluationOrder: policiesInEvaluationOrder.map((policy) => ({
        policyId: policy.id,
        priority: policy.priority
      })),
      policies: policyTraces,
      finalMatchedPolicyId: matchedPolicy?.id,
      finalDecision: decision,
      usedDefaultDecision: matchedPolicy === undefined
    }
  };
}

function tracePolicyRule(policy: PolicyRule, input: ToolCallInput): PolicyRuleTrace {
  const matchChecks = traceMatchChecks(policy.match, input);
  const conditionTrace = traceConditions(policy.conditions, input);
  const checks = [...matchChecks, ...conditionTrace.checks];
  const matchPassed = matchChecks.every((check) => check.passed);
  const matched = matchPassed && conditionTrace.passed;
  const failureReasons = [
    ...matchChecks.filter((check) => !check.passed),
    ...conditionTrace.failureChecks
  ].map((check) => check.reason ?? `${check.field} did not match`);

  return {
    policyId: policy.id,
    priority: policy.priority,
    matched,
    checks,
    failureReasons
  };
}

function getPoliciesInEvaluationOrder(policies: PolicyRule[]): PolicyRule[] {
  return policies
    .map((policy, index) => ({ policy, index }))
    .sort((left, right) => {
      const leftPriority = left.policy.priority;
      const rightPriority = right.policy.priority;

      if (leftPriority !== undefined && rightPriority !== undefined) {
        return leftPriority === rightPriority
          ? left.index - right.index
          : leftPriority - rightPriority;
      }

      if (leftPriority !== undefined) {
        return -1;
      }

      if (rightPriority !== undefined) {
        return 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.policy);
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

interface ConditionTraceResult {
  checks: PolicyCheckTrace[];
  failureChecks: PolicyCheckTrace[];
  passed: boolean;
}

function traceConditions(
  conditions: PolicyCondition[] | PolicyConditionGroup | undefined,
  input: ToolCallInput
): ConditionTraceResult {
  if (conditions === undefined) {
    return {
      checks: [],
      failureChecks: [],
      passed: true
    };
  }

  if (Array.isArray(conditions)) {
    const checks = conditions.map((condition) => traceConditionCheck(condition, input));
    return {
      checks,
      failureChecks: checks.filter((check) => !check.passed),
      passed: checks.every((check) => check.passed)
    };
  }

  return traceConditionGroup(conditions, input);
}

function traceConditionGroup(
  conditions: PolicyConditionGroup,
  input: ToolCallInput
): ConditionTraceResult {
  const checks: PolicyCheckTrace[] = [];
  const failureChecks: PolicyCheckTrace[] = [];
  let passed = true;

  if (conditions.all !== undefined) {
    const allChecks = conditions.all.map((condition) =>
      traceConditionCheck(condition, input, "all")
    );
    const allPassed = allChecks.every((check) => check.passed);
    const summary = createConditionGroupCheck("all", allChecks, allPassed);
    checks.push(summary, ...allChecks);
    if (!allPassed) {
      failureChecks.push(summary);
      passed = false;
    }
  }

  if (conditions.any !== undefined) {
    const anyChecks = conditions.any.map((condition) =>
      traceConditionCheck(condition, input, "any")
    );
    const anyPassed = anyChecks.some((check) => check.passed);
    const summary = createConditionGroupCheck("any", anyChecks, anyPassed);
    checks.push(summary, ...anyChecks);
    if (!anyPassed) {
      failureChecks.push(summary);
      passed = false;
    }
  }

  return {
    checks,
    failureChecks,
    passed
  };
}

function createConditionGroupCheck(
  group: PolicyConditionGroupOperator,
  checks: PolicyCheckTrace[],
  passed: boolean
): PolicyCheckTrace {
  const passedCount = checks.filter((check) => check.passed).length;
  const expectedValue =
    group === "all" ? "every condition passes" : "at least one condition passes";

  return {
    type: "condition_group",
    field: `conditions.${group}`,
    operator: group,
    expectedValue,
    actualValue: `${passedCount}/${checks.length} passed`,
    passed,
    group,
    reason: passed
      ? undefined
      : `conditions.${group} failed; ${passedCount}/${checks.length} passed`
  };
}

function traceConditionCheck(
  condition: PolicyCondition,
  input: ToolCallInput,
  group?: PolicyConditionGroupOperator
): PolicyCheckTrace {
  const actualValue = getPathValue(input, condition.field);
  const passed = evaluateCondition(condition, actualValue);

  return {
    type: "condition",
    field: condition.field,
    operator: condition.operator,
    expectedValue: condition.value,
    actualValue,
    passed,
    group,
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
