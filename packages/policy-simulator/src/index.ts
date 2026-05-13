import { readFile } from "node:fs/promises";
import YAML from "yaml";
import { z } from "zod";
import {
  evaluatePolicy,
  loadPolicyFile,
  type Decision,
  type PolicyFile,
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
}

export interface PolicyTestRunResult {
  passed: boolean;
  results: PolicyTestResult[];
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
  casesPath: string
): Promise<PolicyTestRunResult> {
  const [policyFile, casesFile] = await Promise.all([
    loadPolicyFile(policyPath),
    loadPolicyCasesFile(casesPath)
  ]);

  return runPolicyTests(policyFile, casesFile);
}

export function runPolicyTests(
  policyFile: PolicyFile,
  casesFile: PolicyCasesFile
): PolicyTestRunResult {
  const results = casesFile.cases.map((testCase) => runPolicyTest(policyFile, testCase));
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
      ...testResult.errors.map((error) => `  - ${error}`)
    ];
  });

  const passedCount = result.results.filter((testResult) => testResult.passed).length;
  lines.push("");
  lines.push(`Policy tests: ${passedCount}/${result.results.length} passed`);

  return lines.join("\n");
}

function runPolicyTest(policyFile: PolicyFile, testCase: PolicyTestCase): PolicyTestResult {
  const evaluation = evaluatePolicy(policyFile, testCase.input);
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
    errors
  };
}

function formatDecision(decision: Decision, matchedPolicyId: string | undefined): string {
  return matchedPolicyId === undefined ? decision : `${decision} (${matchedPolicyId})`;
}
