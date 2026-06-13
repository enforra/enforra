import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  checkToolDrift,
  parseToolManifest,
  parseBaselineFile,
  createToolBaseline
} from "@enforra/drift-core";
import type {
  ToolManifest,
  BaselineFile,
  PolicyDocumentRef,
  CapabilityRule
} from "@enforra/drift-core";
import { loadPolicyFile } from "@enforra/policy-core";
import { formatDriftMarkdown, formatDriftText } from "./format.js";
import type { CliDriftReport } from "./format.js";

const severityRank = {
  low: 1,
  medium: 2,
  high: 3
};

export type DriftReportFormat = "text" | "json" | "markdown";
export type DriftFailLevel = "none" | "low" | "medium" | "high";

export interface DriftCliIo {
  stdout?: Pick<typeof console, "log">;
  stderr?: Pick<typeof console, "error">;
  cwd?: string;
}

export interface DriftParsedOptions {
  values: Map<string, string>;
  flags: Set<string>;
}

export interface DriftOptionSpec {
  commandName: string;
  values?: string[];
  flags?: string[];
}

const failLevelRank: Record<DriftFailLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

/** Returns true if the result should cause a non-zero exit code. */
export function shouldFail(result: CliDriftReport, failLevel: DriftFailLevel): boolean {
  if (failLevel === "none") {
    return false;
  }

  const threshold = failLevelRank[failLevel];
  return result.drifts.some((f) => severityRank[f.severity] >= threshold);
}

const defaultBaselinePath = ".enforra/tool-baseline.json";

/** Command runner for 'drift baseline' */
export async function runDriftBaseline(args: string[], io: DriftCliIo = {}): Promise<number> {
  const stdout = io.stdout ?? console;
  const stderr = io.stderr ?? console;
  const cwd = io.cwd ?? process.cwd();

  try {
    const options = parseDriftOptions(args, {
      commandName: "drift baseline",
      values: ["--tools", "--out"]
    });

    const toolsPath = options.values.get("--tools");
    if (toolsPath === undefined) {
      stderr.error("--tools is required");
      stderr.error("Usage: enforra drift baseline --tools tools.json [--out baseline.json]");
      return 1;
    }

    const outPath = resolvePath(cwd, options.values.get("--out") ?? defaultBaselinePath);
    const resolvedToolsPath = resolvePath(cwd, toolsPath);

    let contents: string;
    try {
      contents = await readFile(resolvedToolsPath, "utf8");
    } catch {
      stderr.error(`Tool manifest not found: ${resolvedToolsPath}`);
      return 1;
    }

    let manifest: ToolManifest;
    try {
      manifest = parseToolManifest(contents);
    } catch (error) {
      stderr.error(
        `Invalid tool manifest: ${error instanceof Error ? error.message : String(error)}`
      );
      return 1;
    }

    const baseline = createToolBaseline(manifest);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(baseline, null, 2) + "\n", "utf8");

    stdout.log(`Baseline created: ${outPath}`);
    stdout.log(`Tools recorded: ${baseline.toolCount}`);
    return 0;
  } catch (error) {
    stderr.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** Command runner for 'drift check' */
export async function runDriftCheck(args: string[], io: DriftCliIo = {}): Promise<number> {
  const stdout = io.stdout ?? console;
  const stderr = io.stderr ?? console;
  const cwd = io.cwd ?? process.cwd();

  try {
    const options = parseDriftOptions(args, {
      commandName: "drift check",
      values: ["--tools", "--baseline", "--format", "--fail-on", "--policy", "--lint-rules"]
    });

    const toolsPathInput = options.values.get("--tools");
    if (toolsPathInput === undefined) {
      stderr.error("--tools is required");
      stderr.error(
        "Usage: enforra drift check --tools tools.json [--baseline baseline.json] [--format text|json|markdown] [--fail-on none|low|medium|high] [--policy policy.yaml] [--lint-rules rules.json]"
      );
      return 1;
    }

    const baselinePathInput = options.values.get("--baseline") ?? defaultBaselinePath;
    const toolsPath = resolvePath(cwd, toolsPathInput);
    const baselinePath = resolvePath(cwd, baselinePathInput);
    const format = parseDriftReportFormat(options.values.get("--format") ?? "text");
    const failOn = parseDriftFailLevel(options.values.get("--fail-on") ?? "medium");

    let toolsContents: string;
    try {
      toolsContents = await readFile(toolsPath, "utf8");
    } catch {
      stderr.error(`Tool manifest not found: ${toolsPath}`);
      return 1;
    }

    let baselineContents: string;
    try {
      baselineContents = await readFile(baselinePath, "utf8");
    } catch {
      stderr.error(`Baseline file not found: ${baselinePath}`);
      stderr.error("Run 'enforra drift baseline' first to create a baseline.");
      return 1;
    }

    let manifest: ToolManifest;
    try {
      manifest = parseToolManifest(toolsContents);
    } catch (error) {
      stderr.error(
        `Invalid tool manifest: ${error instanceof Error ? error.message : String(error)}`
      );
      return 1;
    }

    let baseline: BaselineFile;
    try {
      baseline = parseBaselineFile(baselineContents);
    } catch (error) {
      stderr.error(
        `Invalid baseline file: ${error instanceof Error ? error.message : String(error)}`
      );
      return 1;
    }

    const policyPathInput = options.values.get("--policy");
    let policyDocument: PolicyDocumentRef | undefined = undefined;
    if (policyPathInput !== undefined) {
      const policyPath = resolvePath(cwd, policyPathInput);
      try {
        policyDocument = (await loadPolicyFile(policyPath)) as unknown as PolicyDocumentRef;
      } catch (error) {
        stderr.error(
          `Failed to load policy file: ${error instanceof Error ? error.message : String(error)}`
        );
        return 1;
      }
    }

    const rulesPathInput = options.values.get("--lint-rules");
    let rules: CapabilityRule[] | undefined = undefined;
    if (rulesPathInput !== undefined) {
      const resolvedRulesPath = resolvePath(cwd, rulesPathInput);
      try {
        const rawRules = JSON.parse(await readFile(resolvedRulesPath, "utf8"));
        if (Array.isArray(rawRules)) {
          rules = rawRules.map((r: unknown) => {
            const rule = r as Record<string, unknown>;
            if (typeof rule.pattern !== "string" || typeof rule.capability !== "string") {
              throw new Error("Invalid rule format: pattern and capability must be strings");
            }
            return {
              pattern: new RegExp(rule.pattern, "i"),
              capability: rule.capability
            };
          });
        }
      } catch (error) {
        stderr.error(
          `Failed to load/parse --lint-rules file: ${error instanceof Error ? error.message : String(error)}`
        );
        return 1;
      }
    }

    const coreResult = checkToolDrift({
      baseline,
      currentManifest: manifest,
      policyDocument,
      rules
    });

    const result: CliDriftReport = {
      ...coreResult,
      baselineFile: baselinePathInput,
      toolsFile: toolsPathInput,
      checkedAt: new Date().toISOString()
    };

    if (format === "json") {
      stdout.log(JSON.stringify(result, null, 2));
    } else if (format === "markdown") {
      stdout.log(formatDriftMarkdown(result));
    } else {
      stdout.log(formatDriftText(result));
    }

    if (shouldFail(result, failOn)) {
      return 1;
    }

    return 0;
  } catch (error) {
    stderr.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
function parseDriftOptions(args: string[], spec: DriftOptionSpec): DriftParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const allowedValues = new Set(spec.values ?? []);
  const allowedFlags = new Set(spec.flags ?? []);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (allowedValues.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      values.set(arg, value);
      index += 1;
      continue;
    }

    if (allowedFlags.has(arg)) {
      flags.add(arg);
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unsupported option for ${spec.commandName}: ${arg}`);
    }
  }

  return { values, flags };
}

function parseDriftReportFormat(format: string): DriftReportFormat {
  if (format === "text" || format === "json" || format === "markdown") {
    return format;
  }
  throw new Error("--format must be one of: text, json, markdown");
}

function parseDriftFailLevel(level: string): DriftFailLevel {
  if (level === "none" || level === "low" || level === "medium" || level === "high") {
    return level;
  }
  throw new Error("--fail-on must be one of: none, low, medium, high");
}

function resolvePath(cwd: string, inputPath: string): string {
  return isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath);
}
