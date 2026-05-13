import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parsePolicyCasesYaml, runPolicyTests, type PolicyCasesFile } from "../src/index.js";
import type { PolicyFile } from "@enforra/policy-core";

const policyFile: PolicyFile = {
  version: 1,
  defaults: {
    decision: "block"
  },
  policies: [
    {
      id: "allow-search",
      match: {
        agent: "test-agent",
        tool: "repo.search"
      },
      decision: "allow"
    },
    {
      id: "approve-email",
      match: {
        agent: "test-agent",
        tool: "email.send"
      },
      conditions: [
        {
          field: "args.recipient",
          operator: "contains",
          value: "@external.example"
        }
      ],
      decision: "require_approval"
    }
  ]
};

describe("policy simulator", () => {
  it("passes when all cases match expected decisions", () => {
    const result = runPolicyTests(policyFile, {
      version: 1,
      cases: [
        {
          name: "search is allowed",
          input: {
            agent: "test-agent",
            tool: "repo.search",
            args: {}
          },
          expect: {
            decision: "allow",
            matchedPolicyId: "allow-search"
          }
        }
      ]
    });

    expect(result.passed).toBe(true);
    expect(result.results[0]?.passed).toBe(true);
  });

  it("fails when the decision is wrong", () => {
    const result = runPolicyTests(policyFile, singleCase({ decision: "block" }));

    expect(result.passed).toBe(false);
    expect(result.results[0]?.errors).toContain("expected decision block, received allow");
  });

  it("fails when matchedPolicyId is wrong", () => {
    const result = runPolicyTests(
      policyFile,
      singleCase({ decision: "allow", matchedPolicyId: "wrong-policy" })
    );

    expect(result.passed).toBe(false);
    expect(result.results[0]?.errors).toContain(
      "expected matchedPolicyId wrong-policy, received allow-search"
    );
  });

  it("passes when optional matchedPolicyId is omitted", () => {
    const result = runPolicyTests(policyFile, singleCase({ decision: "allow" }));

    expect(result.passed).toBe(true);
  });

  it("fails validation for invalid cases YAML", () => {
    expect(() =>
      parsePolicyCasesYaml(`
version: 1
cases:
  - name: missing expected decision
    input:
      agent: test-agent
      tool: repo.search
      args: {}
    expect: {}
`)
    ).toThrow(z.ZodError);
  });
});

function singleCase(expectation: {
  decision: "allow" | "block" | "require_approval" | "log_only";
  matchedPolicyId?: string;
}): PolicyCasesFile {
  return {
    version: 1,
    cases: [
      {
        name: "search policy",
        input: {
          agent: "test-agent",
          tool: "repo.search",
          args: {}
        },
        expect: expectation
      }
    ]
  };
}
