import { describe, expect, it } from "vitest";
import { parseToolManifest, parseBaselineFile } from "../src/index.js";

describe("manifest", () => {
  describe("parseToolManifest", () => {
    it("parses valid manifest", () => {
      const manifest = parseToolManifest(JSON.stringify({ tools: [{ name: "a.tool" }] }));
      expect(manifest.tools).toHaveLength(1);
      expect(manifest.tools[0].name).toBe("a.tool");
    });

    it("rejects non-object", () => {
      expect(() => parseToolManifest('"string"')).toThrow("JSON object");
    });

    it("rejects missing tools array", () => {
      expect(() => parseToolManifest("{}")).toThrow("contain a 'tools' array");
    });

    it("rejects tool without name", () => {
      expect(() =>
        parseToolManifest(JSON.stringify({ tools: [{ description: "no name" }] }))
      ).toThrow("non-empty 'name'");
    });

    it("rejects duplicate tool names fail clearly", () => {
      expect(() =>
        parseToolManifest(
          JSON.stringify({
            tools: [{ name: "dup.tool" }, { name: "dup.tool" }]
          })
        )
      ).toThrow("Duplicate tool name found in manifest: dup.tool");
    });
  });

  describe("parseBaselineFile", () => {
    it("parses valid baseline", () => {
      const baseline = parseBaselineFile(
        JSON.stringify({ version: 1, tools: [], toolCount: 0, createdAt: "now" })
      );
      expect(baseline.version).toBe(1);
    });

    it("rejects wrong version", () => {
      expect(() => parseBaselineFile(JSON.stringify({ version: 2, tools: [] }))).toThrow(
        "Unsupported baseline version"
      );
    });
  });
});
