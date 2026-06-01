import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";
import {
  evaluatePolicy,
  evaluatePolicyWithTrace,
  loadPolicyFile,
  type Decision,
  type PolicyFile,
  type PolicyEvaluationResult,
  type PolicyEvaluationResultWithTrace,
  type PolicyEvaluationTrace,
  type ToolCallInput
} from "@enforra/policy-core";

const decisions = ["allow", "block", "require_approval", "log_only"] as const;

export interface PolicyTestCase {
  name: string;
  input: ToolCallInput;
  expect: {
    decision: Decision;
    matchedPolicyId?: string;
  };
}

export interface PolicyCasesFile {
  version: 1;
  cases: PolicyTestCase[];
}

export interface PolicyTestResult {
  name: string;
  passed: boolean;
  expectedDecision: Decision;
  actualDecision: Decision;
  expectedMatchedPolicyId?: string;
  actualMatchedPolicyId?: string;
  reason: string;
  errors: string[];
  trace?: PolicyEvaluationTrace;
  input: ToolCallInput;
}

export interface PolicyTestRunResult {
  passed: boolean;
  results: PolicyTestResult[];
}

export interface RunPolicyTestsOptions {
  trace?: boolean;
}

const recordSchema = z.record(z.unknown());

const toolCallInputSchema = z
  .object({
    agent: z.string().min(1),
    tool: z.string().min(1),
    args: recordSchema,
    context: recordSchema.optional()
  })
  .strict();

const policyTestCaseSchema = z
  .object({
    name: z.string().min(1),
    input: toolCallInputSchema,
    expect: z
      .object({
        decision: z.enum(decisions),
        matchedPolicyId: z.string().min(1).optional()
      })
      .strict()
  })
  .strict();

const policyCasesFileSchema = z
  .object({
    version: z.literal(1),
    cases: z.array(policyTestCaseSchema).min(1)
  })
  .strict();

export async function loadPolicyCasesFile(path: string): Promise<PolicyCasesFile> {
  const source = await readFile(path, "utf8");
  return parsePolicyCasesYaml(source);
}

export function parsePolicyCasesYaml(source: string): PolicyCasesFile {
  const parsed = YAML.parse(source) as unknown;
  return policyCasesFileSchema.parse(parsed);
}

export async function runPolicyTestsFromFiles(
  policyPath: string,
  casesPath: string,
  options: RunPolicyTestsOptions = {}
): Promise<PolicyTestRunResult> {
  const [policyFile, casesFile] = await Promise.all([
    loadPolicyFile(policyPath),
    loadPolicyCasesFile(casesPath)
  ]);

  return runPolicyTests(policyFile, casesFile, options);
}

/**
 * Execute a set of policy test cases against a policy and collect the per-case outcomes.
 *
 * @param policyFile - The policy definition to evaluate test cases against
 * @param casesFile - The collection of test cases to run
 * @param options - Optional run options (e.g., `trace` to collect evaluation traces)
 * @returns A `PolicyTestRunResult` with `passed` set to `true` if every test passed, and `results` containing individual `PolicyTestResult` entries
 */
export function runPolicyTests(
  policyFile: PolicyFile,
  casesFile: PolicyCasesFile,
  options: RunPolicyTestsOptions = {}
): PolicyTestRunResult {
  const results = casesFile.cases.map((testCase) => runPolicyTest(policyFile, testCase, options));
  return {
    passed: results.every((result) => result.passed),
    results
  };
}

const SENSITIVE_KEYS = [
  "token",
  "secret",
  "api_key",
  "apikey",
  "password",
  "private_key",
  "privatekey",
  "authorization",
  "cookie"
];

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

const NORMALIZED_SENSITIVE_KEYS = SENSITIVE_KEYS.map(normalizeSensitiveKey);

/**
 * Determine whether an object key should be redacted based on sensitive substrings.
 *
 * @param key - The object property name to check
 * @returns `true` if the key contains a sensitive substring after lowercasing and removing hyphens/underscores, `false` otherwise
 */
function shouldRedactKey(key: string): boolean {
  const normalized = normalizeSensitiveKey(key);
  return NORMALIZED_SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive));
}

/**
 * Produces a copy of the input with values for sensitive object keys replaced by "[REDACTED]".
 *
 * Recursively traverses arrays and objects; object properties whose keys match known sensitive substrings (for example: token, secret, api_key, password, private_key, authorization, cookie) have their values replaced with the literal string `"[REDACTED]"`. Null and undefined are returned unchanged; non-object primitive values are returned as-is.
 *
 * @param value - The value to redact.
 * @returns A redacted copy of `value` with sensitive property values replaced by `"[REDACTED]"`.
 */
export function redactPayload(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactPayload);
  }
  if (typeof value === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = shouldRedactKey(key) ? "[REDACTED]" : redactPayload(nestedValue);
    }
    return redacted;
  }
  return value;
}

/**
 * Format a policy test run result as a human-readable multi-line report.
 *
 * @param result - The aggregated policy test run outcome to format
 * @returns A multi-line string listing each case with pass/fail status, agent, tool, expected and actual decisions, matched policy id, and — for failures — redacted arguments, reason, and optional trace; ends with a summary count of passed and failed cases
 */
export function formatPolicyTestRun(result: PolicyTestRunResult): string {
  const lines: string[] = ["Policy test results", ""];

  for (const testResult of result.results) {
    const status = testResult.passed ? "PASS" : "FAIL";
    lines.push(`${status}  ${testResult.name}`);
    lines.push(`  agent: ${testResult.input.agent}`);
    lines.push(`  tool: ${testResult.input.tool}`);
    if (!testResult.passed) {
      lines.push(`  args: ${JSON.stringify(redactPayload(testResult.input.args))}`);
    }
    lines.push(`  expected: ${testResult.expectedDecision}`);
    lines.push(`  actual: ${testResult.actualDecision}`);

    const matchedPolicy = testResult.actualMatchedPolicyId ?? "default";
    lines.push(`  matched policy: ${matchedPolicy}`);

    if (!testResult.passed) {
      lines.push(`  reason: ${testResult.reason}`);
      if (testResult.trace) {
        lines.push(...formatTraceLines(testResult.trace));
      }
    }

    lines.push("");
  }

  const passedCount = result.results.filter((r) => r.passed).length;
  const failedCount = result.results.length - passedCount;
  lines.push("Summary:");
  lines.push(`${passedCount} passed, ${failedCount} failed`);

  return lines.join("\n");
}

/**
 * Format a policy test run result as a pretty-printed JSON string.
 *
 * The output includes total counts and an array of per-case summaries.
 *
 * @returns A pretty-printed JSON string containing:
 *  - `total`: total number of test cases
 *  - `passed`: number of passing cases
 *  - `failed`: number of failing cases
 *  - `cases`: an array of case objects with `name`, `agent`, `tool`, `expected`, `actual`, `matchedPolicyId`, `reason`, and `passed`
 */
export function formatPolicyTestRunJson(result: PolicyTestRunResult): string {
  const passedCount = result.results.filter((r) => r.passed).length;
  const failedCount = result.results.length - passedCount;

  const cases = result.results.map((r) => ({
    name: r.name,
    agent: r.input.agent,
    tool: r.input.tool,
    expected: r.expectedDecision,
    actual: r.actualDecision,
    matchedPolicyId: r.actualMatchedPolicyId,
    reason: r.reason,
    passed: r.passed
  }));

  return JSON.stringify(
    {
      total: result.results.length,
      passed: passedCount,
      failed: failedCount,
      cases
    },
    null,
    2
  );
}

/**
 * Execute a single policy test case against a policy and produce a structured test result.
 *
 * @param policyFile - The policy definition to evaluate the test case against.
 * @param testCase - The test case containing the input to evaluate and the expected decision (and optional expected matched policy id).
 * @param options - Run options; when `options.trace` is `true`, the evaluation includes a trace and the returned result will contain a `trace` field.
 * @returns A PolicyTestResult containing:
 * - `passed`: `true` if the actual decision and (when provided) matched policy id match the expectations, `false` otherwise.
 * - `expectedDecision` and `actualDecision`: the expected and observed decisions.
 * - `expectedMatchedPolicyId` and `actualMatchedPolicyId`: expected and observed matched policy ids (when present).
 * - `reason`: textual reason from the evaluation.
 * - `errors`: array of mismatch messages (empty when passed).
 * - optional `trace`: evaluation trace when `options.trace` is `true`.
 * - `input`: the original test case input.
 */
function runPolicyTest(
  policyFile: PolicyFile,
  testCase: PolicyTestCase,
  options: RunPolicyTestsOptions
): PolicyTestResult {
  const evaluation: PolicyEvaluationResult | PolicyEvaluationResultWithTrace = options.trace
    ? evaluatePolicyWithTrace(policyFile, testCase.input)
    : evaluatePolicy(policyFile, testCase.input);
  const trace = options.trace ? (evaluation as PolicyEvaluationResultWithTrace).trace : undefined;
  const errors: string[] = [];

  if (evaluation.decision !== testCase.expect.decision) {
    errors.push(`expected decision ${testCase.expect.decision}, received ${evaluation.decision}`);
  }

  if (
    testCase.expect.matchedPolicyId !== undefined &&
    evaluation.matchedPolicyId !== testCase.expect.matchedPolicyId
  ) {
    errors.push(
      `expected matchedPolicyId ${testCase.expect.matchedPolicyId}, received ${
        evaluation.matchedPolicyId ?? "none"
      }`
    );
  }

  return {
    name: testCase.name,
    passed: errors.length === 0,
    expectedDecision: testCase.expect.decision,
    actualDecision: evaluation.decision,
    expectedMatchedPolicyId: testCase.expect.matchedPolicyId,
    actualMatchedPolicyId: evaluation.matchedPolicyId,
    reason: evaluation.reason,
    errors,
    trace,
    input: testCase.input
  };
}

/**
 * Format a policy evaluation trace as an indented list of human-readable lines for display.
 *
 * The output includes one block per policy (policy id, optional priority, matched status),
 * followed by each check within the policy (condition groups or individual checks with operator,
 * expected and actual values and pass/fail), and a final line with the overall decision and
 * matched policy id or indication that the default decision was used.
 *
 * @param trace - The policy evaluation trace to format; if `undefined`, no lines are produced.
 * @returns An array of indented strings representing the formatted trace; returns an empty array when `trace` is `undefined`.
 */
function formatTraceLines(trace: PolicyEvaluationTrace | undefined): string[] {
  if (trace === undefined) {
    return [];
  }

  const lines = ["  Trace:"];
  for (const policyTrace of trace.policies) {
    const priority =
      policyTrace.priority === undefined ? "" : ` priority ${String(policyTrace.priority)}`;
    lines.push(
      `    - ${policyTrace.policyId}${priority}: ${policyTrace.matched ? "matched" : "not matched"}`
    );

    for (const check of policyTrace.checks) {
      if (check.type === "condition_group") {
        lines.push(
          `      - ${check.field}: ${check.passed ? "passed" : "failed"} (${formatValue(
            check.actualValue
          )})`
        );
        continue;
      }

      const groupLabel = check.group === undefined ? "" : ` [${check.group}]`;
      lines.push(
        `      - ${check.field}${groupLabel} ${check.operator} ${formatValue(
          check.expectedValue
        )}: ${check.passed ? "passed" : "failed"} (actual ${formatValue(check.actualValue)})`
      );
    }
  }

  lines.push(
    `    final: ${trace.finalDecision}${
      trace.finalMatchedPolicyId === undefined ? "" : ` (${trace.finalMatchedPolicyId})`
    }${trace.usedDefaultDecision ? " using default decision" : ""}`
  );

  return lines;
}

function formatValue(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
