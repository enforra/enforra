import { describe, expect, it } from "vitest";
import { checkToolDrift, createToolBaseline } from "../src/index.js";
import type { ToolManifest } from "../src/index.js";

describe("diff", () => {
  const riskProfile = {
    driftSeverities: {
      permissions_expanded: "high" as const,
      capabilities_expanded: "high" as const,
      schema_changed: "medium" as const,
      removed_tool: "high" as const
    }
  };

  describe("compareTool and checkToolDrift", () => {
    it("detects schema, capability, and permission drift without severity by default", () => {
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
      expect(result.drifts.every((d) => d.severity === undefined)).toBe(true);
      expect(result.summary.high).toBeUndefined();
    });

    it("assigns severities if riskProfile is provided", () => {
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

      const result = checkToolDrift({ baseline, currentManifest: current, riskProfile });
      expect(result.summary.driftFound).toBe(3);
      expect(result.drifts.find((d) => d.type === "schema_changed")?.severity).toBe("medium");
      expect(result.drifts.find((d) => d.type === "permissions_expanded")?.severity).toBe("high");
      expect(result.drifts.find((d) => d.type === "capabilities_expanded")?.severity).toBe("high");
      expect(result.summary.high).toBe(2);
      expect(result.summary.medium).toBe(1);
    });

    it("detects removed tools", () => {
      const original: ToolManifest = {
        tools: [{ name: "fs.read" }]
      };
      const baseline = createToolBaseline(original);
      const current: ToolManifest = { tools: [] };

      const result = checkToolDrift({ baseline, currentManifest: current, riskProfile });
      expect(result.drifts[0].type).toBe("removed_tool");
      expect(result.drifts[0].severity).toBe("high");
    });

    it("detects server name identity drift", () => {
      const original: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            server: { name: "trusted-server", endpoint: "http://localhost:8080" }
          }
        ]
      };
      const baseline = createToolBaseline(original);

      // Case 1: Server name changed, same endpoint
      const current1: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            server: { name: "untrusted-server", endpoint: "http://localhost:8080" }
          }
        ]
      };
      const result1 = checkToolDrift({ baseline, currentManifest: current1 });
      expect(result1.summary.driftFound).toBe(1);
      expect(result1.drifts[0].type).toBe("endpoint_changed");
      expect(result1.drifts[0].detail).toContain("server name changed");

      // Case 2: Server name same, endpoint changed
      const current2: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            server: { name: "trusted-server", endpoint: "http://localhost:9090" }
          }
        ]
      };
      const result2 = checkToolDrift({ baseline, currentManifest: current2 });
      expect(result2.summary.driftFound).toBe(1);
      expect(result2.drifts[0].type).toBe("endpoint_changed");
      expect(result2.drifts[0].detail).toContain("endpoint changed");

      // Case 3: Both changed
      const current3: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            server: { name: "untrusted-server", endpoint: "http://localhost:9090" }
          }
        ]
      };
      const result3 = checkToolDrift({ baseline, currentManifest: current3 });
      expect(result3.summary.driftFound).toBe(1);
      expect(result3.drifts[0].type).toBe("endpoint_changed");
      expect(result3.drifts[0].detail).toContain("endpoint and server name changed");
    });

    it("detects server name identity drift when manifests only include server name", () => {
      const original: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            server: { name: "trusted-server" }
          }
        ]
      };
      const baseline = createToolBaseline(original);
      const current: ToolManifest = {
        tools: [
          {
            name: "fs.read",
            server: { name: "untrusted-server" }
          }
        ]
      };
      const result = checkToolDrift({ baseline, currentManifest: current });
      expect(result.summary.driftFound).toBe(1);
      expect(result.drifts[0].type).toBe("endpoint_changed");
      expect(result.drifts[0].detail).toContain("server name changed");
    });
  });
});
