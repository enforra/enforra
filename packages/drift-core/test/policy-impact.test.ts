import { describe, expect, it } from "vitest";
import { analyzePolicyImpact } from "../src/index.js";
import type { PolicyDocumentRef } from "../src/index.js";

describe("policy-impact", () => {
  describe("analyzePolicyImpact", () => {
    it("detects policy rule match for allow decisions on drifted tools", () => {
      const drifts = [
        {
          tool: "fs.read",
          type: "permissions_expanded" as const,
          severity: "high" as const,
          detail: "expanded"
        }
      ];
      const policyDocument: PolicyDocumentRef = {
        version: 1,
        policies: [
          {
            id: "allow-fs",
            match: { tool: "fs.read" },
            decision: "allow"
          }
        ]
      };

      const affected = analyzePolicyImpact({ drifts, policyDocument });
      expect(affected.length).toBe(1);
      expect(affected[0].policyId).toBe("allow-fs");
      expect(affected[0].tool).toBe("fs.read");
      expect(affected[0].severity).toBe("high");
    });

    it("matches policy rule with unconstrained match (omitted match.tool)", () => {
      const drifts = [
        {
          tool: "fs.read",
          type: "permissions_expanded" as const,
          severity: "high" as const,
          detail: "expanded"
        }
      ];
      const policyDocument: PolicyDocumentRef = {
        version: 1,
        policies: [
          {
            id: "agent-wide-allow",
            match: { agent: "some-agent" }, // match.tool is undefined
            decision: "allow"
          }
        ]
      };

      const affected = analyzePolicyImpact({ drifts, policyDocument });
      expect(affected.length).toBe(1);
      expect(affected[0].policyId).toBe("agent-wide-allow");
      expect(affected[0].tool).toBe("fs.read");
    });

    it("avoids duplicate affected policy entries when wildcard allow covers new high-risk tool", () => {
      const drifts = [
        {
          tool: "terminal.run",
          type: "new_tool" as const,
          severity: "high" as const,
          detail: "new high-risk tool"
        }
      ];
      const policyDocument: PolicyDocumentRef = {
        version: 1,
        policies: [
          {
            id: "wildcard-allow",
            match: { tool: "*" },
            decision: "allow"
          }
        ]
      };

      const affected = analyzePolicyImpact({ drifts, policyDocument });
      // Should not have duplicate wildcard-allow records
      expect(affected.length).toBe(1);
      expect(affected[0].policyId).toBe("wildcard-allow");
    });
  });
});
