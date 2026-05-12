import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluatePolicy, loadPolicyFile, parsePolicyYaml, type PolicyFile } from "../src/index.js";

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
        tool: "stripe.refund",
        args: {
          amount_lte: 50
        }
      },
      decision: "allow"
    },
    {
      id: "approve-medium-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund",
        args: {
          amount_gt: 50,
          amount_lte: 500
        }
      },
      decision: "require_approval"
    },
    {
      id: "block-large-refunds",
      match: {
        agent: "support-agent",
        tool: "stripe.refund",
        args: {
          amount_gt: 500
        }
      },
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

  it("requires approval for medium refunds", () => {
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

  it("supports generic field_equals conditions", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        policies: [
          {
            id: "production-delete",
            match: {
              agent: "support-agent",
              tool: "account.delete",
              field_equals: {
                field: "environment",
                value: "production"
              }
            },
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

  it("supports generic contains conditions", () => {
    const result = evaluatePolicy(
      {
        version: 1,
        policies: [
          {
            id: "external-email",
            match: {
              agent: "support-agent",
              tool: "email.send",
              not_contains: {
                field: "recipient",
                value: "@example.com"
              }
            },
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
});
