import { describe, expect, it } from "vitest";
import {
  guessCapabilitiesFromToolMetadata,
  detectCapabilityMetadataMismatches,
  lintToolMetadata
} from "../src/index.js";

describe("metadata-lint", () => {
  const customRules = [
    {
      pattern: /terminal|shell/i,
      capability: "shell"
    },
    {
      pattern: /secret/i,
      capability: "secret"
    }
  ];

  const riskProfile = {
    highRiskCapabilities: ["shell", "secret"],
    driftSeverities: {
      capability_metadata_mismatch: "high" as const
    }
  };

  describe("guessCapabilitiesFromToolMetadata", () => {
    it("guesses capabilities using custom rules", () => {
      const guesses = guessCapabilitiesFromToolMetadata(
        "terminal.run",
        "Execute command",
        customRules
      );
      const shellGuess = guesses.find((g) => g.capability === "shell");
      expect(shellGuess).toBeDefined();
    });

    it("returns empty suggestions if no rules are matched", () => {
      const guesses = guessCapabilitiesFromToolMetadata(
        "calculator.add",
        "Add numbers",
        customRules
      );
      expect(guesses).toEqual([]);
    });
  });

  describe("detectCapabilityMetadataMismatches", () => {
    it("detects mismatch without severity if no riskProfile is provided", () => {
      const warnings = detectCapabilityMetadataMismatches(
        {
          name: "terminal.run",
          capabilities: ["read"]
        },
        undefined,
        customRules
      );
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe("capability_metadata_mismatch");
      expect(warnings[0].severity).toBeUndefined();
      expect(warnings[0].detail).toContain("shell");
    });

    it("detects mismatch with severity if riskProfile is provided", () => {
      const warnings = detectCapabilityMetadataMismatches(
        {
          name: "terminal.run",
          capabilities: ["read"]
        },
        riskProfile,
        customRules
      );
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe("capability_metadata_mismatch");
      expect(warnings[0].severity).toBe("high");
      expect(warnings[0].detail).toContain("shell");
    });

    it("does not warn if the high-risk capability is declared", () => {
      const warnings = detectCapabilityMetadataMismatches(
        {
          name: "terminal.run",
          capabilities: ["shell"]
        },
        riskProfile,
        customRules
      );
      expect(warnings.length).toBe(0);
    });
  });

  describe("lintToolMetadata", () => {
    it("lints all tools in manifest", () => {
      const manifest = {
        tools: [
          {
            name: "terminal.run",
            capabilities: ["read"]
          }
        ]
      };
      const warnings = lintToolMetadata({ manifest, rules: customRules, riskProfile });
      expect(warnings.length).toBe(1);
      expect(warnings[0].severity).toBe("high");
    });
  });
});
