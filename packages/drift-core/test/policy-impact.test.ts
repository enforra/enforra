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
  });
});
