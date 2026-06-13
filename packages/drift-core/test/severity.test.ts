import { describe, expect, it } from "vitest";
import { driftSeverity, newToolSeverity } from "../src/index.js";

describe("severity", () => {
  it("determines new tool severity", () => {
    const rules = [
      { pattern: /terminal|shell/i, capability: "shell" },
      { pattern: /production/i, capability: "production" }
    ];
    expect(newToolSeverity({ name: "terminal.run" }, rules)).toBe("high");
    expect(newToolSeverity({ name: "calculator.add" }, rules)).toBe("low");
    expect(newToolSeverity({ name: "terminal.run", capabilities: ["read"] }, rules)).toBe("high");
    expect(newToolSeverity({ name: "terminal.run", capabilities: ["shell"] }, rules)).toBe("high");
    expect(newToolSeverity({ name: "db.query", description: "Read-only query" }, rules)).toBe(
      "low"
    );
    expect(newToolSeverity({ name: "db.query", capabilities: ["production"] }, rules)).toBe("high");
  });

  it("maps drift types to severity", () => {
    expect(driftSeverity("permissions_expanded")).toBe("high");
    expect(driftSeverity("permissions_reduced")).toBe("low");
    expect(driftSeverity("schema_changed")).toBe("medium");
    expect(driftSeverity("metadata_changed")).toBe("low");
    expect(driftSeverity("removed_tool")).toBe("high");
    expect(driftSeverity("new_tool")).toBe("low");
  });
});
