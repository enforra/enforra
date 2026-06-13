import { describe, expect, it } from "vitest";
import {
  deterministicHash,
  guessCapabilitiesFromToolMetadata,
  detectCapabilityMetadataMismatches,
  driftSeverity,
  newToolSeverity,
  createToolBaseline,
  checkToolDrift,
  analyzePolicyImpact
} from "../src/index.js";
import type { ToolManifest, PolicyDocumentRef } from "../src/index.js";

describe("drift-core", () => {
  describe("deterministicHash", () => {
    it("produces the same hash regardless of key order", () => {
      const a = deterministicHash({ b: 2, a: 1 });
      const b = deterministicHash({ a: 1, b: 2 });
      expect(a).toBe(b);
    });

    it("produces different hashes for different values", () => {
      const a = deterministicHash({ x: 1 });
      const b = deterministicHash({ x: 2 });
      expect(a).not.toBe(b);
    });
  });

  describe("guessCapabilitiesFromToolMetadata", () => {
    it("guesses shell for terminal tool", () => {
      const guesses = guessCapabilitiesFromToolMetadata("terminal.run", "Execute shell command");
      const shellGuess = guesses.find((g) => g.capability === "shell");
      expect(shellGuess).toBeDefined();
    });

    it("guesses read and write for filesystem tool", () => {
      const guesses = guessCapabilitiesFromToolMetadata(
        "fs.read_write",
        "Read and write to a file"
      );
      expect(guesses.some((g) => g.capability === "read")).toBe(true);
      expect(guesses.some((g) => g.capability === "write")).toBe(true);
    });
  });

  describe("detectCapabilityMetadataMismatches", () => {
    it("detects mismatch if tool suggests high-risk capability but omits it from declared capabilities", () => {
      const warnings = detectCapabilityMetadataMismatches({
        name: "terminal.run",
        capabilities: ["read"]
      });
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe("capability_metadata_mismatch");
      expect(warnings[0].severity).toBe("high");
      expect(warnings[0].detail).toContain("shell");
    });

    it("does not warn if the high-risk capability is declared", () => {
      const warnings = detectCapabilityMetadataMismatches({
        name: "terminal.run",
        capabilities: ["shell"]
      });
      expect(warnings.length).toBe(0);
    });
  });

  describe("severity", () => {
    it("determines new tool severity", () => {
      expect(newToolSeverity({ name: "terminal.run" })).toBe("high");
      expect(newToolSeverity({ name: "calculator.add" })).toBe("low");
      expect(newToolSeverity({ name: "terminal.run", capabilities: ["read"] })).toBe("high");
      expect(newToolSeverity({ name: "terminal.run", capabilities: ["shell"] })).toBe("high");
    });

    it("maps drift types to severity", () => {
      expect(driftSeverity("permissions_expanded")).toBe("high");
      expect(driftSeverity("permissions_reduced")).toBe("low");
      expect(driftSeverity("schema_changed")).toBe("medium");
    });
  });

  describe("createBaselineTool and createToolBaseline", () => {
    it("creates correct baseline structure", () => {
      const manifest: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            description: "Read file",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"]
            },
            permissions: ["fs:read"],
            capabilities: ["read"]
          }
        ]
      };
      const baseline = createToolBaseline(manifest);
      expect(baseline.version).toBe(1);
      expect(baseline.toolCount).toBe(1);
      expect(baseline.tools[0].name).toBe("fs.read");
      expect(baseline.tools[0].requiredArgs).toEqual(["path"]);
      expect(baseline.tools[0].capabilities).toEqual(["read"]);
    });
  });

  describe("compareTool and checkToolDrift", () => {
    it("detects schema, capability, and permission drift", () => {
      const original: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            inputSchema: { type: "object" },
            permissions: ["fs:read"],
            capabilities: ["read"]
          }
        ]
      };
      const baseline = createToolBaseline(original);
      const current: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            inputSchema: { type: "object", properties: { foo: { type: "string" } } },
            permissions: ["fs:read", "fs:write"],
            capabilities: ["read", "write"]
          }
        ]
      };

      const result = checkToolDrift({ baseline, currentManifest: current });
      expect(result.summary.driftFound).toBe(3); // schema, permissions_expanded, capabilities_expanded
      expect(result.drifts.some((d) => d.type === "schema_changed")).toBe(true);
      expect(result.drifts.some((d) => d.type === "permissions_expanded")).toBe(true);
      expect(result.drifts.some((d) => d.type === "capabilities_expanded")).toBe(true);
    });

    it("detects removed tools", () => {
      const original: ToolManifest = {
        tools: [{ name: "fs.read" }]
      };
      const baseline = createToolBaseline(original);
      const current: ToolManifest = { tools: [] };

      const result = checkToolDrift({ baseline, currentManifest: current });
      expect(result.drifts[0].type).toBe("removed_tool");
      expect(result.drifts[0].severity).toBe("high");
    });
  });

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
