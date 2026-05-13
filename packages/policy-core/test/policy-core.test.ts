import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluatePolicy,
  evaluatePolicyWithTrace,
  loadPolicyFile,
  parsePolicyYaml,
  type PolicyFile
} from "../src/index.js";

const refundPolicy: PolicyFile = {
  version: 1,
  defaults: {
    decision: "block"
  },
  policies: [
    {
      id: "allow-small-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund"
      },
      conditions: [{ field: "args.amount", operator: "lte", value: 50 }],
      decision: "allow"
    },
    {
      id: "approve-medium-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund"
      },
      conditions: [
        { field: "args.amount", operator: "gt", value: 50 },
        { field: "args.amount", operator: "lte", value: 500 }
      ],
      decision: "require_approval"
    },
    {
      id: "block-large-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund"
      },
      conditions: [{ field: "args.amount", operator: "gt", value: 500 }],
      decision: "block"
    }
  ]
};

describe("policy-core", () => {
  it("allows small refunds", () => {
    const result = evaluatePolicy(refundPolicy, {
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 }
    });

    expect(result.decision).toBe("allow");
    expect(result.matchedPolicyId).toBe("allow-small-refunds");
  });

  it("supports generic gt and lte conditions", () => {
    const result = evaluatePolicy(refundPolicy, {
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 250 }
    });

    expect(result.decision).toBe("require_approval");
    expect(result.matchedPolicyId).toBe("approve-medium-refunds");
  });

  it("blocks large refunds", () => {
    const result = evaluatePolicy(refundPolicy, {
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 1000 }
    });

    expect(result.decision).toBe("block");
    expect(result.matchedPolicyId).toBe("block-large-refunds");
  });

  it("defaults unknown tools to block", () => {
    const result = evaluatePolicy(refundPolicy, {
      agent: "support-agent",
      tool: "unknown.tool",
      args: { amount: 20 }
    });

    expect(result.decision).toBe("block");
    expect(result.matchedPolicyId).toBeUndefined();
  });

  it("uses the first matching policy", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        policies: [
          {
            id: "first",
            match: { agent: "support-agent", tool: "stripe.refund" },
            decision: "log_only"
          },
          {
            id: "second",
            match: { agent: "support-agent", tool: "stripe.refund" },
            decision: "block"
          }
        ]
      },
      {
        agent: "support-agent",
        tool: "stripe.refund",
        args: { amount: 20 }
      }
    );

    expect(result.decision).toBe("log_only");
    expect(result.matchedPolicyId).toBe("first");
  });

  it("fails validation for invalid YAML policy shape", () => {
    expect(() =>
      parsePolicyYaml(`
version: 2
defaults:
  decision: allow
policies: []
`)
    ).toThrow();
  });

  it("rejects empty condition arrays", () => {
    expect(() =>
      parsePolicyYaml(`
version: 1
policies:
  - id: empty-conditions
    match:
      agent: support-agent
      tool: stripe.refund
    conditions: []
    decision: allow
`)
    ).toThrow();
  });

  it("rejects policies without match fields or conditions", () => {
    expect(() =>
      parsePolicyYaml(`
version: 1
policies:
  - id: accidental-global-allow
    match: {}
    decision: allow
`)
    ).toThrow();
  });

  it("supports generic contains conditions with dot path lookup from args", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        policies: [
          {
            id: "workspace-read",
            match: {
              agent: "coding-agent",
              tool: "file.read"
            },
            conditions: [{ field: "args.path", operator: "contains", value: "/workspace/" }],
            decision: "allow"
          }
        ]
      },
      {
        agent: "coding-agent",
        tool: "file.read",
        args: { path: "/workspace/src/index.ts" }
      }
    );

    expect(result.decision).toBe("allow");
    expect(result.matchedPolicyId).toBe("workspace-read");
  });

  it("supports generic not_contains conditions", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        policies: [
          {
            id: "external-email",
            match: {
              agent: "support-agent",
              tool: "email.send"
            },
            conditions: [
              { field: "args.recipient", operator: "not_contains", value: "@example.com" }
            ],
            decision: "require_approval"
          }
        ]
      },
      {
        agent: "support-agent",
        tool: "email.send",
        args: { recipient: "recipient@external.test" }
      }
    );

    expect(result.decision).toBe("require_approval");
    expect(result.matchedPolicyId).toBe("external-email");
  });

  it("supports dot path lookup from context", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        policies: [
          {
            id: "production-delete",
            match: {
              agent: "support-agent",
              tool: "account.delete"
            },
            conditions: [{ field: "context.environment", operator: "eq", value: "production" }],
            decision: "block"
          }
        ]
      },
      {
        agent: "support-agent",
        tool: "account.delete",
        args: {},
        context: { environment: "production" }
      }
    );

    expect(result.decision).toBe("block");
    expect(result.matchedPolicyId).toBe("production-delete");
  });

  it("does not match unknown fields", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        defaults: { decision: "block" },
        policies: [
          {
            id: "missing-field",
            match: {
              agent: "support-agent",
              tool: "stripe.refund"
            },
            conditions: [{ field: "args.missing", operator: "neq", value: "never" }],
            decision: "allow"
          }
        ]
      },
      {
        agent: "support-agent",
        tool: "stripe.refund",
        args: { amount: 20 }
      }
    );

    expect(result.decision).toBe("block");
    expect(result.matchedPolicyId).toBeUndefined();
  });

  it("loads and evaluates a custom YAML policy file from any path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "enforra-policy-"));
    const policyPath = join(dir, "custom-policy.yaml");

    await writeFile(
      policyPath,
      `
version: 1
defaults:
  decision: block
policies:
  - id: allow-custom-tool
    match:
      agent: research-agent
      tool: crm.lookup
    conditions:
      - field: args.accountId
        operator: eq
        value: acct_123
    decision: allow
`,
      "utf8"
    );

    const customPolicy = await loadPolicyFile(policyPath);

    const allowedResult = evaluatePolicy(customPolicy, {
      agent: "research-agent",
      tool: "crm.lookup",
      args: { accountId: "acct_123" }
    });

    const unknownToolResult = evaluatePolicy(customPolicy, {
      agent: "research-agent",
      tool: "crm.delete",
      args: { accountId: "acct_123" }
    });

    expect(allowedResult).toMatchObject({
      decision: "allow",
      matchedPolicyId: "allow-custom-tool"
    });
    expect(unknownToolResult).toMatchObject({
      decision: "block",
      matchedPolicyId: undefined
    });
  });

  it("trace shows the first matching policy", () => {
    const result = evaluatePolicyWithTrace(refundPolicy, {
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 20 }
    });

    expect(result.decision).toBe("allow");
    expect(result.trace.finalMatchedPolicyId).toBe("allow-small-refunds");
    expect(result.trace.evaluatedPolicyIds).toEqual(["allow-small-refunds"]);
    expect(result.trace.usedDefaultDecision).toBe(false);
  });

  it("trace shows skipped policy because of tool mismatch", () => {
    const result = evaluatePolicyWithTrace(refundPolicy, {
      agent: "support-agent",
      tool: "email.send",
      args: { amount: 20 }
    });

    const firstPolicyTrace = result.trace.policies[0];
    expect(firstPolicyTrace?.matched).toBe(false);
    expect(firstPolicyTrace?.checks).toContainEqual(
      expect.objectContaining({
        type: "tool",
        field: "tool",
        expectedValue: "stripe.refund",
        actualValue: "email.send",
        passed: false
      })
    );
  });

  it("trace shows failed numeric condition", () => {
    const result = evaluatePolicyWithTrace(refundPolicy, {
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 250 }
    });

    const firstPolicyTrace = result.trace.policies[0];
    expect(firstPolicyTrace?.policyId).toBe("allow-small-refunds");
    expect(firstPolicyTrace?.checks).toContainEqual(
      expect.objectContaining({
        type: "condition",
        field: "args.amount",
        operator: "lte",
        expectedValue: 50,
        actualValue: 250,
        passed: false
      })
    );
  });

  it("trace shows passed conditions", () => {
    const result = evaluatePolicyWithTrace(refundPolicy, {
      agent: "support-agent",
      tool: "stripe.refund",
      args: { amount: 250 }
    });

    const matchedPolicyTrace = result.trace.policies.find(
      (policyTrace) => policyTrace.policyId === "approve-medium-refunds"
    );
    const conditionChecks = matchedPolicyTrace?.checks.filter(
      (check) => check.type === "condition"
    );

    expect(matchedPolicyTrace?.matched).toBe(true);
    expect(conditionChecks).toHaveLength(2);
    expect(conditionChecks?.every((check) => check.passed)).toBe(true);
  });

  it("trace shows default block when no policy matches", () => {
    const result = evaluatePolicyWithTrace(refundPolicy, {
      agent: "support-agent",
      tool: "unknown.tool",
      args: { amount: 20 }
    });

    expect(result.decision).toBe("block");
    expect(result.matchedPolicyId).toBeUndefined();
    expect(result.trace.finalMatchedPolicyId).toBeUndefined();
    expect(result.trace.finalDecision).toBe("block");
    expect(result.trace.usedDefaultDecision).toBe(true);
    expect(result.trace.evaluatedPolicyIds).toEqual([
      "allow-small-refunds",
      "approve-medium-refunds",
      "block-large-refunds"
    ]);
  });
});
