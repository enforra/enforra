import { describe, expect, it } from "vitest";
import { driftSeverity, newToolSeverity } from "../src/index.js";

describe("severity", () => {
  const riskProfile = {
    highRiskCapabilities: ["shell", "production"],
    driftSeverities: {
      permissions_expanded: "high" as const,
      permissions_reduced: "low" as const,
      schema_changed: "medium" as const,
      metadata_changed: "low" as const,
      removed_tool: "high" as const,
      new_tool: "low" as const
    }
  };

  it("determines new tool severity", () => {
    const rules = [
      { pattern: /terminal|shell/i, capability: "shell" },
      { pattern: /production/i, capability: "production" }
    ];
    expect(newToolSeverity({ name: "terminal.run" }, riskProfile, rules)).toBe("high");
    expect(newToolSeverity({ name: "calculator.add" }, riskProfile, rules)).toBe("low");
    expect(
      newToolSeverity({ name: "terminal.run", capabilities: ["read"] }, riskProfile, rules)
    ).toBe("high");
    expect(
      newToolSeverity({ name: "terminal.run", capabilities: ["shell"] }, riskProfile, rules)
    ).toBe("high");
    expect(
      newToolSeverity({ name: "db.query", description: "Read-only query" }, riskProfile, rules)
    ).toBe("low");
    expect(
      newToolSeverity({ name: "db.query", capabilities: ["production"] }, riskProfile, rules)
    ).toBe("high");
  });

  it("returns undefined if no risk profile is provided", () => {
    const rules = [{ pattern: /terminal|shell/i, capability: "shell" }];
    expect(newToolSeverity({ name: "terminal.run" }, undefined, rules)).toBeUndefined();
    expect(driftSeverity("permissions_expanded")).toBeUndefined();
  });

  it("maps drift types to severity", () => {
    expect(driftSeverity("permissions_expanded", riskProfile)).toBe("high");
    expect(driftSeverity("permissions_reduced", riskProfile)).toBe("low");
    expect(driftSeverity("schema_changed", riskProfile)).toBe("medium");
    expect(driftSeverity("metadata_changed", riskProfile)).toBe("low");
    expect(driftSeverity("removed_tool", riskProfile)).toBe("high");
    expect(driftSeverity("new_tool", riskProfile)).toBe("low");
  });
});
