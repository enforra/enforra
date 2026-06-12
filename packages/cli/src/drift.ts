import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single tool definition from a tool manifest file. */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  permissions?: string[];
  capabilities?: string[];
  endpoint?: string;
  [key: string]: unknown;
}

/** The tool manifest file format: a JSON file with a tools array. */
export interface ToolManifest {
  tools: ToolDefinition[];
}

/** A single tool entry stored in the baseline. */
export interface BaselineTool {
  name: string;
  hash: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  permissions?: string[];
  capabilities?: string[];
  inferredCapabilities?: string[];
  endpoint?: string;
}

/** The baseline file format written to disk. */
export interface BaselineFile {
  version: 1;
  createdAt: string;
  toolCount: number;
  tools: BaselineTool[];
}

/** Types of drift that can be detected. */
export type DriftType =
  | "schema_changed"
  | "permissions_changed"
  | "capabilities_changed"
  | "endpoint_changed"
  | "description_changed"
  | "tool_added"
  | "tool_removed";

/** Severity levels for drift findings. */
export type DriftSeverity = "high" | "medium" | "low";

/** A single drift finding for a tool. */
export interface DriftFinding {
  tool: string;
  type: DriftType;
  severity: DriftSeverity;
  detail: string;
}

/** The result of a drift check. */
export interface DriftCheckResult {
  baselineFile: string;
  toolsFile: string;
  checkedAt: string;
  totalTools: number;
  baselineTools: number;
  findings: DriftFinding[];
  summary: {
    high: number;
    medium: number;
    low: number;
    total: number;
  };
}

export type DriftReportFormat = "text" | "json" | "markdown";

export type DriftFailLevel = "none" | "low" | "medium" | "high";

// ---------------------------------------------------------------------------
// Capability inference
// ---------------------------------------------------------------------------

const capabilityPatterns: Array<{ pattern: RegExp; capability: string }> = [
  { pattern: /\bfile|filesystem|fs\b/i, capability: "filesystem" },
  { pattern: /\bread|write|delete|create|list|move|copy\b/i, capability: "data_modification" },
  { pattern: /\bnetwork|http|fetch|request|api|url|curl|wget\b/i, capability: "network" },
  { pattern: /\bterminal|shell|exec|command|run|process|spawn\b/i, capability: "code_execution" },
  { pattern: /\bdb|database|sql|query|table|collection\b/i, capability: "database" },
  { pattern: /\bemail|mail|send|notify|notification\b/i, capability: "communication" },
  { pattern: /\bgit|github|gitlab|repo|commit|branch|pr\b/i, capability: "version_control" },
  { pattern: /\bsecret|key|token|password|credential|auth\b/i, capability: "secrets_access" },
  { pattern: /\bdeploy|release|publish|push\b/i, capability: "deployment" },
  { pattern: /\bsearch|index|crawl|scrape\b/i, capability: "search" }
];

/** Infer capabilities from a tool name and optional description. */
export function inferCapabilities(name: string, description?: string): string[] {
  const text = `${name} ${description ?? ""}`;
  const capabilities = new Set<string>();

  for (const { pattern, capability } of capabilityPatterns) {
    if (pattern.test(text)) {
      capabilities.add(capability);
    }
  }

  return [...capabilities].sort();
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/** Create a deterministic hash of a value using sorted keys. */
export function deterministicHash(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  const normalized = JSON.stringify(sortKeys(value));
  if (normalized === undefined) {
    return "";
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Baseline creation
// ---------------------------------------------------------------------------

/** Create a baseline tool entry from a tool definition. */
export function createBaselineTool(tool: ToolDefinition): BaselineTool {
  const entry: BaselineTool = {
    name: tool.name,
    hash: deterministicHash({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      permissions: tool.permissions,
      capabilities: tool.capabilities,
      endpoint: tool.endpoint
    }),
    inferredCapabilities: inferCapabilities(tool.name, tool.description)
  };

  if (tool.description !== undefined) {
    entry.description = tool.description;
  }
  if (tool.inputSchema !== undefined) {
    entry.inputSchema = tool.inputSchema;
  }
  if (tool.permissions !== undefined) {
    entry.permissions = tool.permissions;
  }
  if (tool.capabilities !== undefined) {
    entry.capabilities = tool.capabilities;
  }
  if (tool.endpoint !== undefined) {
    entry.endpoint = tool.endpoint;
  }

  return entry;
}

/** Build a baseline file object from a tool manifest. */
export function buildBaseline(manifest: ToolManifest): BaselineFile {
  const tools = manifest.tools.map(createBaselineTool).sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    toolCount: tools.length,
    tools
  };
}

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

/** Map a drift type to its severity. */
export function driftSeverity(type: DriftType): DriftSeverity {
  switch (type) {
    case "permissions_changed":
    case "capabilities_changed":
    case "endpoint_changed":
    case "tool_removed":
      return "high";
    case "schema_changed":
      return "medium";
    case "description_changed":
    case "tool_added":
      return "low";
  }
}

/** Compare a current tool definition against a baseline tool entry. */
export function compareTool(current: ToolDefinition, baseline: BaselineTool): DriftFinding[] {
  const findings: DriftFinding[] = [];

  // Schema drift
  const currentSchemaHash = deterministicHash(current.inputSchema);
  const baselineSchemaHash = deterministicHash(baseline.inputSchema);
  if (currentSchemaHash !== baselineSchemaHash) {
    findings.push({
      tool: current.name,
      type: "schema_changed",
      severity: driftSeverity("schema_changed"),
      detail: "input schema has changed since baseline"
    });
  }

  // Permissions drift
  const currentPerms = JSON.stringify((current.permissions ?? []).sort());
  const baselinePerms = JSON.stringify((baseline.permissions ?? []).sort());
  if (currentPerms !== baselinePerms) {
    findings.push({
      tool: current.name,
      type: "permissions_changed",
      severity: driftSeverity("permissions_changed"),
      detail: `permissions changed: baseline=${baselinePerms} current=${currentPerms}`
    });
  }

  // Capabilities drift
  const currentCaps = JSON.stringify((current.capabilities ?? []).sort());
  const baselineCaps = JSON.stringify((baseline.capabilities ?? []).sort());
  if (currentCaps !== baselineCaps) {
    findings.push({
      tool: current.name,
      type: "capabilities_changed",
      severity: driftSeverity("capabilities_changed"),
      detail: `capabilities changed: baseline=${baselineCaps} current=${currentCaps}`
    });
  }

  // Endpoint drift
  if ((current.endpoint ?? "") !== (baseline.endpoint ?? "")) {
    findings.push({
      tool: current.name,
      type: "endpoint_changed",
      severity: driftSeverity("endpoint_changed"),
      detail: `endpoint changed: baseline=${baseline.endpoint ?? "(none)"} current=${current.endpoint ?? "(none)"}`
    });
  }

  // Description drift
  if ((current.description ?? "") !== (baseline.description ?? "")) {
    findings.push({
      tool: current.name,
      type: "description_changed",
      severity: driftSeverity("description_changed"),
      detail: "description has changed since baseline"
    });
  }

  return findings;
}

/** Run a full drift check comparing a manifest against a baseline. */
export function checkDrift(
  manifest: ToolManifest,
  baseline: BaselineFile,
  toolsFile: string,
  baselineFile: string
): DriftCheckResult {
  const findings: DriftFinding[] = [];
  const baselineMap = new Map(baseline.tools.map((t) => [t.name, t]));
  const currentMap = new Map(manifest.tools.map((t) => [t.name, t]));

  // Check each current tool against baseline
  for (const tool of manifest.tools) {
    const baselineTool = baselineMap.get(tool.name);
    if (baselineTool === undefined) {
      findings.push({
        tool: tool.name,
        type: "tool_added",
        severity: driftSeverity("tool_added"),
        detail: "tool is new and was not in the baseline"
      });
    } else {
      findings.push(...compareTool(tool, baselineTool));
    }
  }

  // Check for removed tools
  for (const baselineTool of baseline.tools) {
    if (!currentMap.has(baselineTool.name)) {
      findings.push({
        tool: baselineTool.name,
        type: "tool_removed",
        severity: driftSeverity("tool_removed"),
        detail: "tool was in the baseline but is no longer present"
      });
    }
  }

  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;

  return {
    baselineFile,
    toolsFile,
    checkedAt: new Date().toISOString(),
    totalTools: manifest.tools.length,
    baselineTools: baseline.tools.length,
    findings,
    summary: { high, medium, low, total: findings.length }
  };
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

export function formatDriftText(result: DriftCheckResult): string {
  const lines = [
    "Enforra drift check",
    "",
    `Baseline: ${result.baselineFile}`,
    `Tools:    ${result.toolsFile}`,
    `Checked:  ${result.checkedAt}`,
    "",
    `Baseline tools: ${result.baselineTools}`,
    `Current tools:  ${result.totalTools}`,
    "",
    "Summary:",
    `  High:   ${result.summary.high}`,
    `  Medium: ${result.summary.medium}`,
    `  Low:    ${result.summary.low}`,
    `  Total:  ${result.summary.total}`
  ];

  if (result.findings.length === 0) {
    lines.push("", "No drift detected.");
  } else {
    lines.push("", "Findings:");
    for (const finding of result.findings) {
      lines.push(`  [${finding.severity.toUpperCase()}] ${finding.tool}: ${finding.type}`);
      lines.push(`    ${finding.detail}`);
    }
  }

  return lines.join("\n");
}

export function formatDriftMarkdown(result: DriftCheckResult): string {
  const lines = [
    "# Enforra Drift Check",
    "",
    `Baseline: \`${result.baselineFile}\``,
    `Tools: \`${result.toolsFile}\``,
    `Checked: ${result.checkedAt}`,
    "",
    "## Summary",
    "",
    "| Severity | Count |",
    "| --- | ---: |",
    `| High | ${result.summary.high} |`,
    `| Medium | ${result.summary.medium} |`,
    `| Low | ${result.summary.low} |`,
    `| **Total** | **${result.summary.total}** |`
  ];

  if (result.findings.length === 0) {
    lines.push("", "No drift detected.");
  } else {
    lines.push("", "## Findings", "");
    for (const finding of result.findings) {
      lines.push(`- **[${finding.severity.toUpperCase()}]** \`${finding.tool}\`: ${finding.type}`);
      lines.push(`  - ${finding.detail}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// --fail-on logic
// ---------------------------------------------------------------------------

const severityRank: Record<DriftSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3
};

const failLevelRank: Record<DriftFailLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3
};

/** Returns true if the result should cause a non-zero exit code. */
export function shouldFail(result: DriftCheckResult, failLevel: DriftFailLevel): boolean {
  if (failLevel === "none") {
    return false;
  }

  const threshold = failLevelRank[failLevel];
  return result.findings.some((f) => severityRank[f.severity] >= threshold);
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

export function parseToolManifest(contents: string): ToolManifest {
  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Tool manifest must be a JSON object");
  }

  const tools = parsed["tools"];
  if (!Array.isArray(tools)) {
    throw new Error("Tool manifest must contain a 'tools' array");
  }

  for (const tool of tools) {
    if (!isRecord(tool) || typeof tool["name"] !== "string" || tool["name"].length === 0) {
      throw new Error("Each tool must have a non-empty 'name' string");
    }
  }

  return parsed as unknown as ToolManifest;
}

export function parseBaselineFile(contents: string): BaselineFile {
  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Baseline file must be a JSON object");
  }

  if (parsed["version"] !== 1) {
    throw new Error("Unsupported baseline version");
  }

  const tools = parsed["tools"];
  if (!Array.isArray(tools)) {
    throw new Error("Baseline file must contain a 'tools' array");
  }

  return parsed as unknown as BaselineFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// CLI command handlers
// ---------------------------------------------------------------------------

export interface DriftCliIo {
  stdout?: Pick<typeof console, "log">;
  stderr?: Pick<typeof console, "error">;
  cwd?: string;
}

const defaultBaselinePath = ".enforra/tool-baseline.json";

export async function runDriftBaseline(args: string[], io: DriftCliIo = {}): Promise<number> {
  const stdout = io.stdout ?? console;
  const stderr = io.stderr ?? console;
  const cwd = io.cwd ?? process.cwd();

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

  const baseline = buildBaseline(manifest);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(baseline, null, 2) + "\n", "utf8");

  stdout.log(`Baseline created: ${outPath}`);
  stdout.log(`Tools recorded: ${baseline.toolCount}`);
  return 0;
}

export async function runDriftCheck(args: string[], io: DriftCliIo = {}): Promise<number> {
  const stdout = io.stdout ?? console;
  const stderr = io.stderr ?? console;
  const cwd = io.cwd ?? process.cwd();

  const options = parseDriftOptions(args, {
    commandName: "drift check",
    values: ["--tools", "--baseline", "--format", "--fail-on"]
  });

  const toolsPathInput = options.values.get("--tools");
  if (toolsPathInput === undefined) {
    stderr.error("--tools is required");
    stderr.error(
      "Usage: enforra drift check --tools tools.json [--baseline baseline.json] [--format text|json|markdown] [--fail-on none|low|medium|high]"
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

  const result = checkDrift(manifest, baseline, toolsPathInput, baselinePathInput);

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
}

// ---------------------------------------------------------------------------
// Option parsing (drift-specific, does not share global options)
// ---------------------------------------------------------------------------

interface DriftParsedOptions {
  values: Map<string, string>;
}

interface DriftOptionSpec {
  commandName: string;
  values?: string[];
}

function parseDriftOptions(args: string[], spec: DriftOptionSpec): DriftParsedOptions {
  const values = new Map<string, string>();
  const allowedValues = new Set(spec.values ?? []);

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

    if (arg.startsWith("--")) {
      throw new Error(`Unsupported option for ${spec.commandName}: ${arg}`);
    }
  }

  return { values };
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
