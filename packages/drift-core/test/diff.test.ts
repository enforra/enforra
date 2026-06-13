import { describe, expect, it } from "vitest";
import { checkToolDrift, createToolBaseline } from "../src/index.js";
import type { ToolManifest } from "../src/index.js";

describe("diff", () => {
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
});
