import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import {
  buildBaseline,
  checkDrift,
  compareTool,
  createBaselineTool,
  detectCapabilityMetadataMismatches,
  deterministicHash,
  driftSeverity,
  formatDriftMarkdown,
  formatDriftText,
  getEffectiveCapabilities,
  guessCapabilitiesFromToolMetadata,
  inferCapabilities,
  newToolSeverity,
  parseBaselineFile,
  parseToolManifest,
  shouldFail
} from "../src/drift.js";
import type { BaselineFile, DriftCheckResult, ToolDefinition, ToolManifest } from "../src/drift.js";

const fixtureToolsPath = fileURLToPath(new URL("./fixtures/tools.json", import.meta.url));

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("drift", () => {
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

    it("handles nested objects with stable ordering", () => {
      const a = deterministicHash({ outer: { b: 2, a: 1 } });
      const b = deterministicHash({ outer: { a: 1, b: 2 } });
      expect(a).toBe(b);
    });
  });

  describe("inferCapabilities", () => {
    it("infers read from tool name", () => {
      expect(inferCapabilities("filesystem.read")).toContain("read");
    });

    it("infers shell from terminal tool", () => {
      expect(inferCapabilities("terminal.run")).toContain("shell");
    });

    it("infers write from github create tool", () => {
      expect(inferCapabilities("github.create_issue")).toContain("write");
    });

    it("infers network from description", () => {
      expect(inferCapabilities("myTool", "Send an HTTP request")).toContain("network");
    });

    it("returns empty for unrecognized tools", () => {
      expect(inferCapabilities("calculator.add", "Add two numbers")).toEqual([]);
    });
  });

  describe("guessCapabilitiesFromToolMetadata and getEffectiveCapabilities", () => {
    it("preserves explicitly declared capabilities", () => {
      const tool = { name: "terminal.run", capabilities: ["read", "write"] };
      const caps = getEffectiveCapabilities(tool);
      expect(caps).toEqual(["read", "write"]);
    });

    it("uses heuristic suggestions only as a fallback", () => {
      const toolWithOverriddenCaps = { name: "terminal.run", capabilities: [] };
      expect(getEffectiveCapabilities(toolWithOverriddenCaps)).toEqual([]);

      const toolWithoutCaps = { name: "terminal.run" };
      expect(getEffectiveCapabilities(toolWithoutCaps)).toContain("shell");
    });

    it("deduplicates capabilities", () => {
      const tool = { name: "test", capabilities: ["read", "read", "write"] };
      const caps = getEffectiveCapabilities(tool);
      expect(caps).toEqual(["read", "write"]);
    });

    it("ensures output is stable and sorted", () => {
      const tool = { name: "test", capabilities: ["write", "read"] };
      const caps = getEffectiveCapabilities(tool);
      expect(caps).toEqual(["read", "write"]);
    });

    it("returns correct metadata structure for guessCapabilitiesFromToolMetadata", () => {
      const guesses = guessCapabilitiesFromToolMetadata("terminal.run");
      expect(guesses.length).toBeGreaterThan(0);
      expect(guesses[0]).toEqual({
        capability: "shell",
        source: "heuristic",
        confidence: "low"
      });
    });
  });

  describe("detectCapabilityMetadataMismatches", () => {
    it("flags shell tool with only read declared", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "terminal.run",
        capabilities: ["read"]
      });
      expect(findings.length).toBeGreaterThanOrEqual(1);
      const shellMismatch = findings.find((f) => f.detail.includes("shell"));
      expect(shellMismatch).toBeDefined();
      expect(shellMismatch?.severity).toBe("high");
      expect(shellMismatch?.type).toBe("capability_metadata_mismatch");
    });

    it("returns no findings when shell is declared", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "terminal.run",
        capabilities: ["read", "shell"]
      });
      const shellMismatch = findings.find((f) => f.detail.includes("shell"));
      expect(shellMismatch).toBeUndefined();
    });

    it("returns no findings when capabilities is undefined", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "terminal.run"
      });
      expect(findings).toEqual([]);
    });

    it("returns no findings when capabilities is empty", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "terminal.run",
        capabilities: []
      });
      expect(findings).toEqual([]);
    });

    it("returns no findings for benign tool with read capability", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "calculator.add",
        capabilities: ["read"]
      });
      expect(findings).toEqual([]);
    });

    it("flags delete tool with only write declared", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "filesystem.delete",
        capabilities: ["write"]
      });
      const deleteMismatch = findings.find((f) => f.detail.includes("delete"));
      expect(deleteMismatch).toBeDefined();
      expect(deleteMismatch?.severity).toBe("high");
    });

    it("flags payment tool with only read declared", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "stripe.charge",
        capabilities: ["read"]
      });
      const paymentMismatch = findings.find((f) => f.detail.includes("payment"));
      expect(paymentMismatch).toBeDefined();
      expect(paymentMismatch?.severity).toBe("high");
    });

    it("flags network tool with only read declared", () => {
      const findings = detectCapabilityMetadataMismatches({
        name: "http.request",
        capabilities: ["read"]
      });
      const networkMismatch = findings.find((f) => f.detail.includes("network"));
      expect(networkMismatch).toBeDefined();
      expect(networkMismatch?.severity).toBe("high");
    });
  });

  describe("driftSeverity", () => {
    it("classifies permissions_changed as high", () => {
      expect(driftSeverity("permissions_changed")).toBe("high");
    });

    it("classifies capabilities_changed as high", () => {
      expect(driftSeverity("capabilities_changed")).toBe("high");
    });

    it("classifies endpoint_changed as high", () => {
      expect(driftSeverity("endpoint_changed")).toBe("high");
    });

    it("classifies tool_removed as high", () => {
      expect(driftSeverity("tool_removed")).toBe("high");
    });

    it("classifies schema_changed as medium", () => {
      expect(driftSeverity("schema_changed")).toBe("medium");
    });

    it("classifies description_changed as low", () => {
      expect(driftSeverity("description_changed")).toBe("low");
    });

    it("classifies tool_added as low", () => {
      expect(driftSeverity("tool_added")).toBe("low");
    });

    it("classifies capability_metadata_mismatch as high", () => {
      expect(driftSeverity("capability_metadata_mismatch")).toBe("high");
    });
  });

  describe("newToolSeverity", () => {
    it("returns high for terminal.run", () => {
      expect(newToolSeverity({ name: "terminal.run" })).toBe("high");
    });

    it("returns high for shell.run", () => {
      expect(newToolSeverity({ name: "shell.run" })).toBe("high");
    });

    it("returns high for command.exec", () => {
      expect(newToolSeverity({ name: "command.exec" })).toBe("high");
    });

    it("returns high for bash.run", () => {
      expect(newToolSeverity({ name: "bash.run" })).toBe("high");
    });

    it("returns high when description mentions shell execution", () => {
      expect(newToolSeverity({ name: "my.tool", description: "Run a shell command" })).toBe("high");
    });

    it("returns high for tools with declared code_execution capability", () => {
      expect(newToolSeverity({ name: "custom.tool", capabilities: ["code_execution"] })).toBe(
        "high"
      );
    });

    it("returns high for tools with secrets_access capability", () => {
      expect(newToolSeverity({ name: "vault.read", capabilities: ["secrets_access"] })).toBe(
        "high"
      );
    });

    it("returns high for tools with deployment capability", () => {
      expect(newToolSeverity({ name: "ci.deploy", capabilities: ["deployment"] })).toBe("high");
    });

    it("returns low for a benign tool", () => {
      expect(newToolSeverity({ name: "calculator.add", description: "Add numbers" })).toBe("low");
    });

    it("regression: read-only tool is not high just because it says read", () => {
      expect(newToolSeverity({ name: "filesystem.read", description: "Read files only" })).toBe(
        "low"
      );
    });

    it("regression: query is not automatically high unless risk metadata says so", () => {
      expect(newToolSeverity({ name: "database.query", description: "Query database" })).toBe(
        "low"
      );
      expect(newToolSeverity({ name: "database.query", capabilities: ["production"] })).toBe(
        "high"
      );
    });

    it("returns high for terminal.run with only read capability (metadata mismatch)", () => {
      expect(newToolSeverity({ name: "terminal.run", capabilities: ["read"] })).toBe("high");
    });

    it("returns low for terminal.run with shell capability declared", () => {
      expect(newToolSeverity({ name: "terminal.run", capabilities: ["shell"] })).toBe("high");
    });
  });

  describe("createBaselineTool", () => {
    it("creates a baseline entry with hash", () => {
      const tool: ToolDefinition = {
        name: "filesystem.read",
        description: "Read a file",
        inputSchema: { type: "object" },
        permissions: ["read"]
      };
      const entry = createBaselineTool(tool);

      expect(entry.name).toBe("filesystem.read");
      expect(entry.hash).toHaveLength(64);
      expect(entry.description).toBe("Read a file");
      expect(entry.permissions).toEqual(["read"]);
      expect(entry.inferredCapabilities).toContain("read");
    });

    it("omits undefined optional fields", () => {
      const tool: ToolDefinition = { name: "simple.tool" };
      const entry = createBaselineTool(tool);

      expect(entry.name).toBe("simple.tool");
      expect(entry.description).toBeUndefined();
      expect(entry.inputSchema).toBeUndefined();
      expect(entry.permissions).toBeUndefined();
      expect(entry.capabilities).toBeUndefined();
      expect(entry.endpoint).toBeUndefined();
    });

    it("regression: endpoint query strings are not stored", () => {
      const tool: ToolDefinition = {
        name: "test",
        endpoint: "https://api.example.com/v1/data?token=secret123&query=foo"
      };
      const entry = createBaselineTool(tool);
      expect(entry.endpoint).toBe("https://api.example.com/v1/data");
    });
  });

  describe("buildBaseline", () => {
    it("creates a sorted baseline with version and toolCount", () => {
      const manifest: ToolManifest = {
        tools: [
          { name: "z-tool", description: "last" },
          { name: "a-tool", description: "first" }
        ]
      };
      const baseline = buildBaseline(manifest);

      expect(baseline.version).toBe(1);
      expect(baseline.toolCount).toBe(2);
      expect(baseline.tools[0]?.name).toBe("a-tool");
      expect(baseline.tools[1]?.name).toBe("z-tool");
      expect(baseline.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });
  });

  describe("compareTool", () => {
    it("returns no findings when tool has not changed", () => {
      const tool: ToolDefinition = {
        name: "test.tool",
        description: "Test",
        inputSchema: { type: "object" },
        permissions: ["read"],
        capabilities: ["read"],
        endpoint: "local://test"
      };
      const baseline = createBaselineTool(tool);
      const findings = compareTool(tool, baseline);

      expect(findings).toEqual([]);
    });

    it("detects schema changes", () => {
      const original: ToolDefinition = {
        name: "test.tool",
        inputSchema: { type: "object", properties: { a: { type: "string" } } }
      };
      const baseline = createBaselineTool(original);
      const modified: ToolDefinition = {
        name: "test.tool",
        inputSchema: { type: "object", properties: { a: { type: "number" } } }
      };
      const findings = compareTool(modified, baseline);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe("schema_changed");
      expect(findings[0]?.severity).toBe("medium");
    });

    it("regression: differentiates permission expansion vs reduction", () => {
      const original: ToolDefinition = { name: "test.tool", permissions: ["read"] };
      const baseline = createBaselineTool(original);

      // Expansion
      const expanded = compareTool({ name: "test.tool", permissions: ["read", "write"] }, baseline);
      expect(expanded).toHaveLength(1);
      expect(expanded[0]?.type).toBe("permissions_changed");
      expect(expanded[0]?.severity).toBe("high");
      expect(expanded[0]?.detail).toContain("permissions expanded");

      // Reduction
      const reduced = compareTool({ name: "test.tool", permissions: [] }, baseline);
      expect(reduced).toHaveLength(1);
      expect(reduced[0]?.type).toBe("permissions_changed");
      expect(reduced[0]?.severity).toBe("low");
      expect(reduced[0]?.detail).toContain("permissions reduced");
    });

    it("regression: differentiates capability expansion vs reduction", () => {
      const original: ToolDefinition = { name: "test.tool", capabilities: ["read"] };
      const baseline = createBaselineTool(original);

      // Expansion
      const expanded = compareTool(
        { name: "test.tool", capabilities: ["read", "write"] },
        baseline
      );
      expect(expanded).toHaveLength(1);
      expect(expanded[0]?.type).toBe("capabilities_changed");
      expect(expanded[0]?.severity).toBe("high");
      expect(expanded[0]?.detail).toContain("capabilities expanded");

      // Reduction
      const reduced = compareTool({ name: "test.tool", capabilities: [] }, baseline);
      expect(reduced).toHaveLength(1);
      expect(reduced[0]?.type).toBe("capabilities_changed");
      expect(reduced[0]?.severity).toBe("low");
      expect(reduced[0]?.detail).toContain("capabilities reduced");
    });

    it("detects endpoint changes", () => {
      const original: ToolDefinition = { name: "test.tool", endpoint: "local://test" };
      const baseline = createBaselineTool(original);
      const modified: ToolDefinition = { name: "test.tool", endpoint: "remote://test" };
      const findings = compareTool(modified, baseline);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe("endpoint_changed");
      expect(findings[0]?.severity).toBe("high");
    });

    it("detects description changes", () => {
      const original: ToolDefinition = { name: "test.tool", description: "Original" };
      const baseline = createBaselineTool(original);
      const modified: ToolDefinition = { name: "test.tool", description: "Modified" };
      const findings = compareTool(modified, baseline);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe("description_changed");
      expect(findings[0]?.severity).toBe("low");
    });

    it("detects capability_metadata_mismatch when name suggests shell but caps omit it", () => {
      const tool: ToolDefinition = {
        name: "terminal.run",
        capabilities: ["read"]
      };
      const baseline = createBaselineTool(tool);
      const findings = compareTool(tool, baseline);

      const mismatch = findings.filter((f) => f.type === "capability_metadata_mismatch");
      expect(mismatch.length).toBeGreaterThanOrEqual(1);
      expect(mismatch[0]?.severity).toBe("high");
      expect(mismatch[0]?.detail).toContain("shell");
    });

    it("no mismatch when tool declares the suggested high-risk capability", () => {
      const tool: ToolDefinition = {
        name: "terminal.run",
        capabilities: ["read", "shell"]
      };
      const baseline = createBaselineTool(tool);
      const findings = compareTool(tool, baseline);

      const mismatch = findings.filter((f) => f.type === "capability_metadata_mismatch");
      expect(mismatch).toEqual([]);
    });

    it("no mismatch when tool has no explicit capabilities (heuristics used as fallback)", () => {
      const tool: ToolDefinition = { name: "terminal.run" };
      const baseline = createBaselineTool(tool);
      const findings = compareTool(tool, baseline);

      const mismatch = findings.filter((f) => f.type === "capability_metadata_mismatch");
      expect(mismatch).toEqual([]);
    });
  });

  describe("checkDrift", () => {
    it("returns no findings for identical manifest and baseline", () => {
      const manifest: ToolManifest = {
        tools: [{ name: "a.tool", description: "A tool" }]
      };
      const baseline = buildBaseline(manifest);
      const result = checkDrift(manifest, baseline, "tools.json", "baseline.json");

      expect(result.findings).toEqual([]);
      expect(result.summary.total).toBe(0);
    });

    it("detects a new benign tool as low severity", () => {
      const original: ToolManifest = { tools: [{ name: "a.tool" }] };
      const baseline = buildBaseline(original);
      const current: ToolManifest = {
        tools: [{ name: "a.tool" }, { name: "b.tool" }]
      };
      const result = checkDrift(current, baseline, "tools.json", "baseline.json");

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.type).toBe("tool_added");
      expect(result.findings[0]?.tool).toBe("b.tool");
      expect(result.findings[0]?.severity).toBe("low");
    });

    it("detects a new high-risk tool as high severity", () => {
      const original: ToolManifest = { tools: [{ name: "a.tool" }] };
      const baseline = buildBaseline(original);
      const current: ToolManifest = {
        tools: [{ name: "a.tool" }, { name: "terminal.run" }]
      };
      const result = checkDrift(current, baseline, "tools.json", "baseline.json");

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.type).toBe("tool_added");
      expect(result.findings[0]?.tool).toBe("terminal.run");
      expect(result.findings[0]?.severity).toBe("high");
      expect(result.findings[0]?.detail).toContain("high-risk");
    });

    it("detects a removed tool", () => {
      const original: ToolManifest = {
        tools: [{ name: "a.tool" }, { name: "b.tool" }]
      };
      const baseline = buildBaseline(original);
      const current: ToolManifest = { tools: [{ name: "a.tool" }] };
      const result = checkDrift(current, baseline, "tools.json", "baseline.json");

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.type).toBe("tool_removed");
      expect(result.findings[0]?.tool).toBe("b.tool");
      expect(result.findings[0]?.severity).toBe("high");
    });

    it("includes summary counts", () => {
      const original: ToolManifest = {
        tools: [
          { name: "a.tool", permissions: ["read"] },
          { name: "b.tool", description: "original" }
        ]
      };
      const baseline = buildBaseline(original);
      const current: ToolManifest = {
        tools: [
          { name: "a.tool", permissions: ["read", "write"] },
          { name: "b.tool", description: "changed" }
        ]
      };
      const result = checkDrift(current, baseline, "tools.json", "baseline.json");

      expect(result.summary.high).toBe(1);
      expect(result.summary.low).toBe(1);
      expect(result.summary.total).toBe(2);
    });

    it("detects capability_metadata_mismatch on new tools with explicit caps", () => {
      const original: ToolManifest = { tools: [{ name: "a.tool" }] };
      const baseline = buildBaseline(original);
      const current: ToolManifest = {
        tools: [{ name: "a.tool" }, { name: "terminal.run", capabilities: ["read"] }]
      };
      const result = checkDrift(current, baseline, "tools.json", "baseline.json");

      const addedFinding = result.findings.find(
        (f) => f.tool === "terminal.run" && f.type === "tool_added"
      );
      expect(addedFinding?.severity).toBe("high");

      const mismatchFinding = result.findings.find(
        (f) => f.tool === "terminal.run" && f.type === "capability_metadata_mismatch"
      );
      expect(mismatchFinding).toBeDefined();
      expect(mismatchFinding?.severity).toBe("high");
      expect(mismatchFinding?.detail).toContain("shell");
    });

    it("detects capability_metadata_mismatch on existing tools with explicit caps", () => {
      const manifest: ToolManifest = {
        tools: [{ name: "terminal.run", capabilities: ["read"] }]
      };
      const baseline = buildBaseline(manifest);
      const result = checkDrift(manifest, baseline, "tools.json", "baseline.json");

      const mismatch = result.findings.filter((f) => f.type === "capability_metadata_mismatch");
      expect(mismatch.length).toBeGreaterThanOrEqual(1);
      expect(mismatch[0]?.severity).toBe("high");
    });
  });

  describe("shouldFail", () => {
    function makeResult(severities: Array<"high" | "medium" | "low">): DriftCheckResult {
      return {
        baselineFile: "b.json",
        toolsFile: "t.json",
        checkedAt: "now",
        totalTools: 1,
        baselineTools: 1,
        findings: severities.map((s) => ({
          tool: "test",
          type: "schema_changed" as const,
          severity: s,
          detail: "test"
        })),
        summary: {
          high: severities.filter((s) => s === "high").length,
          medium: severities.filter((s) => s === "medium").length,
          low: severities.filter((s) => s === "low").length,
          total: severities.length
        }
      };
    }

    it("never fails with none", () => {
      expect(shouldFail(makeResult(["high"]), "none")).toBe(false);
    });

    it("fails on low when any drift exists", () => {
      expect(shouldFail(makeResult(["low"]), "low")).toBe(true);
    });

    it("fails on medium with medium findings", () => {
      expect(shouldFail(makeResult(["medium"]), "medium")).toBe(true);
    });

    it("does not fail on medium with only low findings", () => {
      expect(shouldFail(makeResult(["low"]), "medium")).toBe(false);
    });

    it("fails on high with high findings", () => {
      expect(shouldFail(makeResult(["high"]), "high")).toBe(true);
    });

    it("does not fail on high with only medium findings", () => {
      expect(shouldFail(makeResult(["medium"]), "high")).toBe(false);
    });
  });

  describe("formatDriftText", () => {
    it("shows no drift message when clean", () => {
      const result = checkDrift(
        { tools: [{ name: "a.tool" }] },
        buildBaseline({ tools: [{ name: "a.tool" }] }),
        "tools.json",
        "baseline.json"
      );
      const text = formatDriftText(result);
      expect(text).toContain("No drift detected.");
    });

    it("lists findings with severity", () => {
      const result = checkDrift(
        { tools: [{ name: "a.tool", permissions: ["write"] }] },
        buildBaseline({ tools: [{ name: "a.tool", permissions: ["read"] }] }),
        "tools.json",
        "baseline.json"
      );
      const text = formatDriftText(result);
      expect(text).toContain("[HIGH] a.tool: permissions_changed");
    });
  });

  describe("formatDriftMarkdown", () => {
    it("includes markdown table", () => {
      const result = checkDrift(
        { tools: [{ name: "a.tool" }] },
        buildBaseline({ tools: [{ name: "a.tool" }] }),
        "tools.json",
        "baseline.json"
      );
      const md = formatDriftMarkdown(result);
      expect(md).toContain("| Severity | Count |");
      expect(md).toContain("No drift detected.");
    });
  });

  describe("parseToolManifest", () => {
    it("parses valid manifest", () => {
      const manifest = parseToolManifest(JSON.stringify({ tools: [{ name: "a.tool" }] }));
      expect(manifest.tools).toHaveLength(1);
    });

    it("rejects non-object", () => {
      expect(() => parseToolManifest('"string"')).toThrow("JSON object");
    });

    it("rejects missing tools array", () => {
      expect(() => parseToolManifest("{}")).toThrow();
    });

    it("rejects tool without name", () => {
      expect(() =>
        parseToolManifest(JSON.stringify({ tools: [{ description: "no name" }] }))
      ).toThrow("non-empty 'name'");
    });

    it("regression: duplicate tool names fail clearly", () => {
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

// ---------------------------------------------------------------------------
// CLI integration tests
// ---------------------------------------------------------------------------

describe("drift CLI", () => {
  it("drift baseline creates a baseline file from a manifest", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();

    await writeFile(
      toolsPath,
      JSON.stringify({ tools: [{ name: "a.tool", description: "Test" }] }),
      "utf8"
    );

    const exitCode = await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("Baseline created:");
    expect(output.lines.join("\n")).toContain("Tools recorded: 1");

    const baseline = JSON.parse(
      await readFile(join(dir, ".enforra/tool-baseline.json"), "utf8")
    ) as BaselineFile;
    expect(baseline.version).toBe(1);
    expect(baseline.toolCount).toBe(1);
    expect(baseline.tools[0]?.name).toBe("a.tool");
  });

  it("drift baseline writes to custom --out path", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const outPath = join(dir, "custom/baseline.json");
    const output = createOutput();

    await writeFile(toolsPath, JSON.stringify({ tools: [{ name: "b.tool" }] }), "utf8");

    const exitCode = await runCli(["drift", "baseline", "--tools", toolsPath, "--out", outPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    const baseline = JSON.parse(await readFile(outPath, "utf8")) as BaselineFile;
    expect(baseline.tools[0]?.name).toBe("b.tool");
  });

  it("drift baseline fails with missing --tools", async () => {
    const dir = await createTempDir();
    const output = createOutput();

    const exitCode = await runCli(["drift", "baseline"], {
      cwd: dir,
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    expect(output.errors.join("\n")).toContain("--tools is required");
  });

  it("drift baseline fails with missing tools file", async () => {
    const dir = await createTempDir();
    const output = createOutput();

    const exitCode = await runCli(["drift", "baseline", "--tools", join(dir, "missing.json")], {
      cwd: dir,
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    expect(output.errors.join("\n")).toContain("Tool manifest not found:");
  });

  it("drift check detects no drift on identical tools", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();
    const manifest = { tools: [{ name: "x.tool", description: "X" }] };

    await writeFile(toolsPath, JSON.stringify(manifest), "utf8");
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("No drift detected.");
  });

  it("drift check detects schema drift and exits non-zero", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();

    await writeFile(
      toolsPath,
      JSON.stringify({
        tools: [{ name: "x.tool", inputSchema: { type: "object" } }]
      }),
      "utf8"
    );
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    // Modify the schema
    await writeFile(
      toolsPath,
      JSON.stringify({
        tools: [
          {
            name: "x.tool",
            inputSchema: { type: "object", properties: { new: { type: "string" } } }
          }
        ]
      }),
      "utf8"
    );

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(1);
    expect(output.lines.join("\n")).toContain("schema_changed");
  });

  it("drift check with --fail-on none always exits 0", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();

    await writeFile(
      toolsPath,
      JSON.stringify({
        tools: [{ name: "x.tool", permissions: ["read"] }]
      }),
      "utf8"
    );
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    await writeFile(
      toolsPath,
      JSON.stringify({
        tools: [{ name: "x.tool", permissions: ["read", "write", "delete"] }]
      }),
      "utf8"
    );

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath, "--fail-on", "none"], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("permissions_changed");
  });

  it("drift check with --fail-on high ignores medium drift", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();

    await writeFile(
      toolsPath,
      JSON.stringify({
        tools: [{ name: "x.tool", inputSchema: { type: "object" } }]
      }),
      "utf8"
    );
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    await writeFile(
      toolsPath,
      JSON.stringify({
        tools: [{ name: "x.tool", inputSchema: { type: "array" } }]
      }),
      "utf8"
    );

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath, "--fail-on", "high"], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
  });

  it("drift check outputs JSON with --format json", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();
    const manifest = { tools: [{ name: "x.tool" }] };

    await writeFile(toolsPath, JSON.stringify(manifest), "utf8");
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath, "--format", "json"], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output.lines.join("\n")) as DriftCheckResult;
    expect(parsed.summary.total).toBe(0);
    expect(parsed.findings).toEqual([]);
  });

  it("drift check outputs markdown with --format markdown", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();

    await writeFile(toolsPath, JSON.stringify({ tools: [{ name: "x.tool" }] }), "utf8");
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    const exitCode = await runCli(
      ["drift", "check", "--tools", toolsPath, "--format", "markdown"],
      { cwd: dir, stdout: output.stdout }
    );

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("# Enforra Drift Check");
    expect(output.lines.join("\n")).toContain("| Severity | Count |");
  });

  it("drift check fails with missing baseline", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const output = createOutput();

    await writeFile(toolsPath, JSON.stringify({ tools: [{ name: "x.tool" }] }), "utf8");

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath], {
      cwd: dir,
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    expect(output.errors.join("\n")).toContain("Baseline file not found:");
  });

  it("drift check fails with missing --tools", async () => {
    const dir = await createTempDir();
    const output = createOutput();

    const exitCode = await runCli(["drift", "check"], {
      cwd: dir,
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    expect(output.errors.join("\n")).toContain("--tools is required");
  });

  it("drift baseline works with the fixture tools.json", async () => {
    const dir = await createTempDir();
    const output = createOutput();

    const exitCode = await runCli(["drift", "baseline", "--tools", fixtureToolsPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("Tools recorded: 4");
  });

  it("help text includes drift commands", async () => {
    const output = createOutput();
    await runCli(["--help"], { stdout: output.stdout });
    const text = output.lines.join("\n");
    expect(text).toContain("drift baseline");
    expect(text).toContain("drift check");
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "enforra-drift-"));
}

function createOutput(): {
  lines: string[];
  errors: string[];
  stdout: { log: (message: string) => void };
  stderr: { error: (message: string) => void };
} {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    stdout: { log: (message: string) => lines.push(message) },
    stderr: { error: (message: string) => errors.push(message) }
  };
}
