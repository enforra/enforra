import { describe, expect, it } from "vitest";
import { createToolBaseline, createBaselineTool, deterministicHash } from "../src/index.js";
import type { ToolManifest, ToolDefinition } from "../src/index.js";

describe("baseline", () => {
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

    it("omits undefined optional fields in createBaselineTool", () => {
      const tool: ToolDefinition = { name: "simple.tool" };
      const entry = createBaselineTool(tool);

      const rawEntry = entry as unknown as Record<string, unknown>;
      expect(rawEntry.name).toBe("simple.tool");
      expect(rawEntry.description).toBeUndefined();
      expect(rawEntry.inputSchema).toBeUndefined();
      expect(rawEntry.permissions).toEqual([]);
      expect(rawEntry.capabilities).toEqual([]);
    });

    it("sanitizes endpoints (removes query parameters)", () => {
      const tool: ToolDefinition = {
        name: "test",
        endpoint: "https://api.example.com/v1/data?token=secret123&query=foo"
      };
      const entry = createBaselineTool(tool);
      expect(entry.server?.endpointFingerprint).toBe(
        deterministicHash("https://api.example.com/v1/data")
      );
    });

    it("sanitizes non-URL endpoints (removes credentials and query/hash)", () => {
      const tool: ToolDefinition = {
        name: "test",
        endpoint: "local://user:pass@filesystem/path?query=secret#frag"
      };
      const entry = createBaselineTool(tool);
      expect(entry.server?.endpointFingerprint).toBe(deterministicHash("local://filesystem/path"));
    });
  });
});
