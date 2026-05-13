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

export function formatPolicyTestRun(result: PolicyTestRunResult): string {
  const lines = result.results.flatMap((testResult) => {
    const status = testResult.passed ? "PASS" : "FAIL";
    const heading = `${status} ${testResult.name}`;
    if (testResult.passed) {
      return [
        `${heading} -> ${formatDecision(testResult.actualDecision, testResult.actualMatchedPolicyId)}`
      ];
    }

    return [
      `${heading} -> ${formatDecision(testResult.actualDecision, testResult.actualMatchedPolicyId)}`,
      ...testResult.errors.map((error) => `  - ${error}`),
      ...formatTraceLines(testResult.trace)
    ];
  });

  const passedCount = result.results.filter((testResult) => testResult.passed).length;
  lines.push("");
  lines.push(`Policy tests: ${passedCount}/${result.results.length} passed`);

  return lines.join("\n");
}

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
    trace
  };
}

function formatDecision(decision: Decision, matchedPolicyId: string | undefined): string {
  return matchedPolicyId === undefined ? decision : `${decision} (${matchedPolicyId})`;
}

function formatTraceLines(trace: PolicyEvaluationTrace | undefined): string[] {
  if (trace === undefined) {
    return [];
  }

  const lines = ["  Trace:"];
  for (const policyTrace of trace.policies) {
    lines.push(`    - ${policyTrace.policyId}: ${policyTrace.matched ? "matched" : "not matched"}`);

    for (const check of policyTrace.checks) {
      lines.push(
        `      - ${check.field} ${check.operator} ${formatValue(
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
