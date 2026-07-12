import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluatePolicy, type ConditionOperator, type PolicyFile } from "../src/index.js";

type ConformanceCase = {
  name: string;
  operator: Extract<ConditionOperator, "contains" | "not_contains">;
  actual: unknown;
  value: string | number | boolean;
  expected: boolean;
};

type ConformanceFixture = {
  version: 1;
  cases: ConformanceCase[];
};

const fixturePath = fileURLToPath(
  new URL("../../../conformance/policy-array-operators.json", import.meta.url)
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as ConformanceFixture;

describe("policy array operator conformance", () => {
  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const policy: PolicyFile = {
        version: 1,
        defaults: { decision: "block" },
        policies: [
          {
            id: "allow-when-condition-matches",
            match: { tool: "command.exec" },
            conditions: [
              {
                field: "args.actual",
                operator: testCase.operator,
                value: testCase.value
              }
            ],
            decision: "allow"
          }
        ]
      };

      const result = evaluatePolicy(policy, {
        agent: "coding-agent",
        tool: "command.exec",
        args: { actual: testCase.actual }
      });

      expect(result.decision === "allow").toBe(testCase.expected);
    });
  }
});
