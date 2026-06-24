import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";
import type { BaselineFile } from "@enforra/drift-core";

const fixtureToolsPath = fileURLToPath(new URL("./fixtures/tools.json", import.meta.url));

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
    const riskProfilePath = join(dir, "risk-profile.json");
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

    await writeFile(
      riskProfilePath,
      JSON.stringify({
        driftSeverities: { schema_changed: "medium" }
      }),
      "utf8"
    );

    const exitCode = await runCli(
      ["drift", "check", "--tools", toolsPath, "--risk-profile", riskProfilePath],
      {
        cwd: dir,
        stdout: output.stdout
      }
    );

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

    const exitCode = await runCli(["drift", "check", "--tools", toolsPath, "--fail-on", "none"], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
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
    const parsed = JSON.parse(output.lines.join("\n"));
    expect(parsed.summary.driftFound).toBe(0);
    expect(parsed.drifts).toEqual([]);
  });

  it("drift check outputs markdown with --format markdown", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const riskProfilePath = join(dir, "risk-profile.json");
    const output = createOutput();

    await writeFile(toolsPath, JSON.stringify({ tools: [{ name: "x.tool" }] }), "utf8");
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    await writeFile(
      riskProfilePath,
      JSON.stringify({
        driftSeverities: { new_tool: "low" }
      }),
      "utf8"
    );

    const exitCode = await runCli(
      [
        "drift",
        "check",
        "--tools",
        toolsPath,
        "--format",
        "markdown",
        "--risk-profile",
        riskProfilePath
      ],
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

  it("drift check supports optional --lint-rules flag", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const rulesPath = join(dir, "rules.json");
    const riskProfilePath = join(dir, "risk-profile.json");

    // A tool named terminal.run declaring only 'read' capability
    const manifest = {
      tools: [
        {
          name: "terminal.run",
          capabilities: ["read"]
        }
      ]
    };

    // A custom capability rule mapping terminal.run to shell
    const rules = [
      {
        pattern: "terminal|shell",
        capability: "shell"
      }
    ];

    await writeFile(toolsPath, JSON.stringify(manifest), "utf8");
    await writeFile(rulesPath, JSON.stringify(rules), "utf8");
    await writeFile(
      riskProfilePath,
      JSON.stringify({
        driftSeverities: { capability_metadata_mismatch: "high" },
        highRiskCapabilities: ["shell"]
      }),
      "utf8"
    );

    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    // 1. Without --lint-rules, no capability mismatch is flagged
    const outputNoLint = createOutput();
    const exitCodeNoLint = await runCli(["drift", "check", "--tools", toolsPath], {
      cwd: dir,
      stdout: outputNoLint.stdout
    });
    expect(exitCodeNoLint).toBe(0);
    expect(outputNoLint.lines.join("\n")).toContain("No drift detected.");

    // 2. With --lint-rules, capability_metadata_mismatch is flagged
    const outputWithLint = createOutput();
    const exitCodeWithLint = await runCli(
      [
        "drift",
        "check",
        "--tools",
        toolsPath,
        "--lint-rules",
        rulesPath,
        "--risk-profile",
        riskProfilePath
      ],
      {
        cwd: dir,
        stdout: outputWithLint.stdout
      }
    );
    expect(exitCodeWithLint).toBe(1); // Mismatch is HIGH severity, exits non-zero (medium threshold)
    expect(outputWithLint.lines.join("\n")).toContain("capability_metadata_mismatch");
    expect(outputWithLint.lines.join("\n")).toContain("terminal.run");
  });

  it("drift check rejects invalid configurations and unsafe regex", async () => {
    const dir = await createTempDir();
    const toolsPath = join(dir, "tools.json");
    const manifest = { tools: [] };
    await writeFile(toolsPath, JSON.stringify(manifest), "utf8");

    // Create baseline
    await runCli(["drift", "baseline", "--tools", toolsPath], {
      cwd: dir,
      stdout: createOutput().stdout
    });

    // 1. Non-array rules file
    const invalidRulesPath = join(dir, "invalid-rules.json");
    await writeFile(
      invalidRulesPath,
      JSON.stringify({ pattern: "abc", capability: "shell" }),
      "utf8"
    );
    const outputInvalidRules = createOutput();
    const codeInvalidRules = await runCli(
      ["drift", "check", "--tools", toolsPath, "--lint-rules", invalidRulesPath],
      { cwd: dir, stderr: outputInvalidRules.stderr }
    );
    expect(codeInvalidRules).toBe(1);
    expect(outputInvalidRules.errors.join("\n")).toContain("Rules file must contain a JSON array");

    // 2. Unsafe ReDoS regex in rules file
    const unsafeRulesPath = join(dir, "unsafe-rules.json");
    await writeFile(
      unsafeRulesPath,
      JSON.stringify([{ pattern: "(a+)+", capability: "shell" }]),
      "utf8"
    );
    const outputUnsafeRules = createOutput();
    const codeUnsafeRules = await runCli(
      ["drift", "check", "--tools", toolsPath, "--lint-rules", unsafeRulesPath],
      { cwd: dir, stderr: outputUnsafeRules.stderr }
    );
    expect(codeUnsafeRules).toBe(1);
    expect(outputUnsafeRules.errors.join("\n")).toContain("potentially unsafe");

    // 3. Malformed risk profile
    const invalidProfilePath = join(dir, "invalid-profile.json");
    await writeFile(
      invalidProfilePath,
      JSON.stringify({ highRiskCapabilities: "should-be-array" }),
      "utf8"
    );
    const outputInvalidProfile = createOutput();
    const codeInvalidProfile = await runCli(
      ["drift", "check", "--tools", toolsPath, "--risk-profile", invalidProfilePath],
      { cwd: dir, stderr: outputInvalidProfile.stderr }
    );
    expect(codeInvalidProfile).toBe(1);
    expect(outputInvalidProfile.errors.join("\n")).toContain(
      "highRiskCapabilities must be an array"
    );
  });
});

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
