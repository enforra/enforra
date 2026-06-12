import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  runPolicyTestsFromFiles,
  formatPolicyTestRun,
  formatPolicyTestRunJson
} from "@enforra/policy-simulator";
import { verifyAuditLog } from "@enforra/local-audit";

export interface CliIo {
  stdout?: Pick<typeof console, "log">;
  stderr?: Pick<typeof console, "error">;
  cwd?: string;
}

interface ParsedOptions {
  values: Map<string, string>;
  flags: Set<string>;
  positionals: string[];
}

interface OptionSpec {
  commandName: string;
  flags?: string[];
  values?: string[];
  suggestions?: Record<string, string>;
}

type AuditDecision = "allow" | "block" | "require_approval" | "log_only";

type ReportFormat = "text" | "json" | "markdown";

interface SafeAuditEvent {
  timestamp?: string;
  agent?: string;
  tool?: string;
  decision?: AuditDecision;
  matchedPolicyId?: string;
  reason?: string;
  status?: string;
}

interface AuditReportSummary {
  total: number;
  allow: number;
  block: number;
  require_approval: number;
  log_only: number;
  skippedMalformedLines: number;
}

interface AuditReport {
  auditFile: string;
  summary: AuditReportSummary;
  agents: Record<string, number>;
  tools: Record<string, number>;
  decisions: Record<AuditDecision, number>;
  events: SafeAuditEvent[];
}

interface ReportFilters {
  since?: Date;
  agent?: string;
  tool?: string;
  decision?: AuditDecision;
}

const defaultPolicyPath = "policies/enforra.yaml";
const defaultCasesPath = "policies/enforra.cases.yaml";
const defaultAuditPath = ".enforra/audit.jsonl";

export async function runCli(args: string[], io: CliIo = {}): Promise<number> {
  const stdout = io.stdout ?? console;
  const stderr = io.stderr ?? console;
  const cwd = io.cwd ?? process.cwd();

  try {
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
      stdout.log(helpText());
      return 0;
    }

    const [command, subcommand] = args;

    if (command === "init") {
      return await runInit(args.slice(1), cwd, stdout);
    }

    if (command === "test") {
      return await runTest(args.slice(1), cwd, stdout, stderr);
    }

    if (command === "report") {
      return await runReport(args.slice(1), cwd, stdout, stderr);
    }

    if (command === "audit" && subcommand === "verify") {
      return await runAuditVerify(args.slice(2), cwd, stdout, stderr);
    }

    if (command === "doctor") {
      return await runDoctor(cwd, stdout);
    }

    stderr.error(`Unknown command: ${args.join(" ")}`);
    stderr.error("");
    stderr.error(helpText());
    return 1;
  } catch (error) {
    stderr.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function helpText(): string {
  return `Enforra CLI

Commands:
  init             Create starter policy and test files
  test             Run policy tests
  report           Summarize local JSONL audit logs
  audit verify     Verify hash-chain audit log integrity
  doctor           Check local setup`;
}

async function runInit(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">
): Promise<number> {
  const options = parseOptions(args, {
    commandName: "init",
    flags: ["--force"]
  });
  const force = options.flags.has("--force");
  const policyPath = join(cwd, defaultPolicyPath);
  const casesPath = join(cwd, defaultCasesPath);

  if (!force) {
    const existingPaths = [];
    if (await pathExists(policyPath)) {
      existingPaths.push(defaultPolicyPath);
    }
    if (await pathExists(casesPath)) {
      existingPaths.push(defaultCasesPath);
    }
    if (existingPaths.length > 0) {
      throw new Error(`${existingPaths.join(", ")} already exists. Use --force to overwrite.`);
    }
  }

  await writeStarterFile(policyPath, starterPolicy);
  await writeStarterFile(casesPath, starterCases);

  stdout.log(`Created:
  ${defaultPolicyPath}
  ${defaultCasesPath}

Next:
  enforra test --policy ${defaultPolicyPath} --cases ${defaultCasesPath}`);

  return 0;
}

async function writeStarterFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

async function runTest(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">,
  stderr: Pick<typeof console, "error">
): Promise<number> {
  const options = parseOptions(args, {
    commandName: "test",
    flags: ["--trace", "--json"],
    values: ["--policy", "--cases"]
  });
  const policyPath = resolveCliPath(cwd, options.values.get("--policy") ?? defaultPolicyPath);
  const casesPath = resolveCliPath(cwd, options.values.get("--cases") ?? defaultCasesPath);
  const trace = options.flags.has("--trace");
  const json = options.flags.has("--json");
  const result = await runPolicyTestsFromFiles(policyPath, casesPath, { trace });

  if (json) {
    stdout.log(formatPolicyTestRunJson(result));
  } else {
    stdout.log(formatPolicyTestRun(result));
  }

  if (!result.passed) {
    for (const failedResult of result.results.filter((testResult) => !testResult.passed)) {
      for (const error of failedResult.errors) {
        stderr.error(`${failedResult.name}: ${error}`);
      }
    }
  }

  return result.passed ? 0 : 1;
}

async function runAuditVerify(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">,
  stderr: Pick<typeof console, "error">
): Promise<number> {
  const options = parseOptions(args, {
    commandName: "audit verify",
    values: ["--path"],
    suggestions: {
      "--audit": "Use --path for audit verification."
    }
  });
  const auditPath = resolveCliPath(cwd, options.values.get("--path") ?? defaultAuditPath);

  if (!(await pathExists(auditPath))) {
    stderr.error(`Audit log not found: ${auditPath}`);
    stderr.error("Run an Enforra-protected tool call first, then try again.");
    return 1;
  }

  const result = await verifyAuditLog(auditPath);
  if (result.valid) {
    stdout.log(`Audit verification: valid
Events checked: ${result.eventsChecked}`);
    return 0;
  }

  stdout.log(`Audit verification: invalid
Events checked: ${result.eventsChecked}
First invalid line: ${result.firstInvalidLine ?? "unknown"}
Reason: ${result.reason ?? "unknown"}`);
  return 1;
}

async function runReport(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">,
  stderr: Pick<typeof console, "error">
): Promise<number> {
  const options = parseOptions(args, {
    commandName: "report",
    values: ["--audit", "--format", "--since", "--agent", "--tool", "--decision"],
    suggestions: {
      "--path": "Use --audit for audit reports."
    }
  });
  const auditPathInput = options.values.get("--audit") ?? defaultAuditPath;
  const auditPath = resolveCliPath(cwd, auditPathInput);
  const format = parseReportFormat(options.values.get("--format") ?? "text");
  const filters = parseReportFilters(options);

  if (!(await pathExists(auditPath))) {
    stderr.error(`Audit log not found: ${auditPath}`);
    stderr.error("Run an Enforra-protected tool call first, then try again.");
    return 1;
  }

  const report = buildAuditReport(await readFile(auditPath, "utf8"), auditPathInput, filters);

  if (format === "json") {
    stdout.log(JSON.stringify(report, null, 2));
    return 0;
  }

  if (format === "markdown") {
    stdout.log(formatAuditReportMarkdown(report));
    return 0;
  }

  stdout.log(formatAuditReportText(report));
  return 0;
}

function parseReportFormat(format: string): ReportFormat {
  if (format === "text" || format === "json" || format === "markdown") {
    return format;
  }

  throw new Error("--format must be one of: text, json, markdown");
}

function parseReportFilters(options: ParsedOptions): ReportFilters {
  const sinceInput = options.values.get("--since");
  const since = sinceInput === undefined ? undefined : new Date(sinceInput);
  if (since !== undefined && Number.isNaN(since.getTime())) {
    throw new Error("--since must be a valid ISO date or timestamp");
  }

  const decisionInput = options.values.get("--decision");
  const decision = decisionInput === undefined ? undefined : parseAuditDecision(decisionInput);

  return {
    since,
    agent: options.values.get("--agent"),
    tool: options.values.get("--tool"),
    decision
  };
}

function parseAuditDecision(decision: string): AuditDecision {
  if (
    decision === "allow" ||
    decision === "block" ||
    decision === "require_approval" ||
    decision === "log_only"
  ) {
    return decision;
  }

  throw new Error("--decision must be one of: allow, block, require_approval, log_only");
}

function buildAuditReport(
  contents: string,
  auditFile: string,
  filters: ReportFilters
): AuditReport {
  const events: SafeAuditEvent[] = [];
  let skippedMalformedLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const parsed = parseAuditLine(line);
    if (parsed === undefined) {
      skippedMalformedLines += 1;
      continue;
    }

    const event = toSafeAuditEvent(parsed);
    if (matchesReportFilters(event, filters)) {
      events.push(event);
    }
  }

  return {
    auditFile,
    summary: summarizeAuditEvents(events, skippedMalformedLines),
    agents: countBy(events, (event) => event.agent),
    tools: countBy(events, (event) => event.tool),
    decisions: {
      allow: countDecision(events, "allow"),
      block: countDecision(events, "block"),
      require_approval: countDecision(events, "require_approval"),
      log_only: countDecision(events, "log_only")
    },
    events
  };
}

function parseAuditLine(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toSafeAuditEvent(event: Record<string, unknown>): SafeAuditEvent {
  return removeUndefinedProperties({
    timestamp: getString(event, "timestamp"),
    agent: getString(event, "agent"),
    tool: getString(event, "tool") ?? getString(event, "tool_name"),
    decision: getDecision(event, "decision"),
    matchedPolicyId: getString(event, "matchedPolicyId") ?? getString(event, "matched_policy_id"),
    reason: redactSensitiveText(getString(event, "reason")),
    status: getString(event, "status")
  });
}

function matchesReportFilters(event: SafeAuditEvent, filters: ReportFilters): boolean {
  if (filters.agent !== undefined && event.agent !== filters.agent) {
    return false;
  }

  if (filters.tool !== undefined && event.tool !== filters.tool) {
    return false;
  }

  if (filters.decision !== undefined && event.decision !== filters.decision) {
    return false;
  }

  if (filters.since !== undefined && event.timestamp !== undefined) {
    const eventDate = new Date(event.timestamp);
    if (!Number.isNaN(eventDate.getTime()) && eventDate < filters.since) {
      return false;
    }
  }

  return true;
}

function summarizeAuditEvents(
  events: SafeAuditEvent[],
  skippedMalformedLines: number
): AuditReportSummary {
  return {
    total: events.length,
    allow: countDecision(events, "allow"),
    block: countDecision(events, "block"),
    require_approval: countDecision(events, "require_approval"),
    log_only: countDecision(events, "log_only"),
    skippedMalformedLines
  };
}

function countDecision(events: SafeAuditEvent[], decision: AuditDecision): number {
  return events.filter((event) => event.decision === decision).length;
}

function countBy(
  events: SafeAuditEvent[],
  valueForEvent: (event: SafeAuditEvent) => string | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    const value = valueForEvent(event);
    if (value !== undefined) {
      counts[value] = (counts[value] ?? 0) + 1;
    }
  }
  return sortCounts(counts);
}

function sortCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }

      return leftKey.localeCompare(rightKey);
    })
  );
}

function formatAuditReportText(report: AuditReport): string {
  const lines = [
    "Enforra audit report",
    "",
    "Audit file:",
    report.auditFile,
    "",
    "Summary:",
    `Total events: ${report.summary.total}`,
    `Allowed: ${report.summary.allow}`,
    `Blocked: ${report.summary.block}`,
    `Required approval: ${report.summary.require_approval}`,
    `Logged only: ${report.summary.log_only}`
  ];

  if (report.summary.skippedMalformedLines > 0) {
    lines.push(`Skipped malformed lines: ${report.summary.skippedMalformedLines}`);
  }

  lines.push("", "Top agents:", ...formatCountLines(report.agents));
  lines.push("", "Top tools:", ...formatCountLines(report.tools));
  lines.push("", "Blocked actions:", ...formatActionLines(blockedEvents(report)));
  lines.push("", "Approval required:", ...formatActionLines(approvalRequiredEvents(report)));

  return lines.join("\n");
}

function formatAuditReportMarkdown(report: AuditReport): string {
  const lines = [
    "# Enforra Audit Report",
    "",
    `Audit file: \`${report.auditFile}\``,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Total events | ${report.summary.total} |`,
    `| Allowed | ${report.summary.allow} |`,
    `| Blocked | ${report.summary.block} |`,
    `| Required approval | ${report.summary.require_approval} |`,
    `| Logged only | ${report.summary.log_only} |`,
    `| Skipped malformed lines | ${report.summary.skippedMalformedLines} |`,
    "",
    "## Decision Counts",
    "",
    "| Decision | Count |",
    "| --- | ---: |",
    `| allow | ${report.decisions.allow} |`,
    `| block | ${report.decisions.block} |`,
    `| require_approval | ${report.decisions.require_approval} |`,
    `| log_only | ${report.decisions.log_only} |`,
    "",
    "## Top Tools",
    "",
    ...formatMarkdownCountLines(report.tools),
    "",
    "## Blocked Actions",
    "",
    ...formatMarkdownActionLines(blockedEvents(report)),
    "",
    "## Approval Required Actions",
    "",
    ...formatMarkdownActionLines(approvalRequiredEvents(report))
  ];

  return lines.join("\n");
}

function formatCountLines(counts: Record<string, number>): string[] {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return ["(none)"];
  }

  return entries.map(([name, count]) => `${name}: ${count}`);
}

function formatMarkdownCountLines(counts: Record<string, number>): string[] {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return ["(none)"];
  }

  return [
    "| Tool | Count |",
    "| --- | ---: |",
    ...entries.map(([name, count]) => `| \`${name}\` | ${count} |`)
  ];
}

function formatActionLines(events: SafeAuditEvent[]): string[] {
  if (events.length === 0) {
    return ["(none)"];
  }

  return events.flatMap((event) => {
    const lines = [`* ${formatEventHeader(event)}`];
    if (event.reason !== undefined) {
      lines.push(`  reason: ${event.reason}`);
    }
    if (event.matchedPolicyId !== undefined) {
      lines.push(`  matched policy: ${event.matchedPolicyId}`);
    }
    return lines;
  });
}

function formatMarkdownActionLines(events: SafeAuditEvent[]): string[] {
  if (events.length === 0) {
    return ["(none)"];
  }

  return events.flatMap((event) => {
    const lines = [`- ${formatEventHeader(event)}`];
    if (event.reason !== undefined) {
      lines.push(`  - reason: ${event.reason}`);
    }
    if (event.matchedPolicyId !== undefined) {
      lines.push(`  - matched policy: \`${event.matchedPolicyId}\``);
    }
    return lines;
  });
}

function formatEventHeader(event: SafeAuditEvent): string {
  return [event.timestamp, event.agent, event.tool]
    .filter((value) => value !== undefined)
    .join(" ");
}

function blockedEvents(report: AuditReport): SafeAuditEvent[] {
  return report.events.filter((event) => event.decision === "block");
}

function approvalRequiredEvents(report: AuditReport): SafeAuditEvent[] {
  return report.events.filter((event) => event.decision === "require_approval");
}

function resolveCliPath(cwd: string, inputPath: string): string {
  return isAbsolute(inputPath) ? inputPath : resolve(cwd, inputPath);
}

async function runDoctor(cwd: string, stdout: Pick<typeof console, "log">): Promise<number> {
  const lines = ["Enforra doctor", ""];
  lines.push(nodeMajorVersion() >= 20 ? "✓ Node.js >=20" : "! Node.js <20");

  try {
    await access(cwd, constants.W_OK);
    lines.push("✓ current directory writable");
  } catch {
    lines.push("! current directory is not writable");
  }

  const policiesPath = join(cwd, "policies");
  if (await directoryExists(policiesPath)) {
    lines.push("✓ policies directory found");
  } else {
    try {
      await access(cwd, constants.W_OK);
      lines.push("✓ policies directory can be created");
    } catch {
      lines.push("! policies directory missing and cannot be created");
    }
  }

  const gitignorePath = join(cwd, ".gitignore");
  const gitignore = await readOptionalFile(gitignorePath);
  if (
    gitignore
      ?.split(/\r?\n/)
      .some((line) => line.trim() === ".enforra" || line.trim() === ".enforra/")
  ) {
    lines.push("✓ .enforra found in .gitignore");
  } else {
    lines.push("! .enforra not found in .gitignore");
  }

  lines.push(await packageManagerLine(cwd));
  lines.push(await sdkInstalledLine(cwd));

  stdout.log(lines.join("\n"));
  return 0;
}

async function packageManagerLine(cwd: string): Promise<string> {
  if (await pathExists(join(cwd, "pnpm-lock.yaml"))) {
    return "✓ package manager detected: pnpm";
  }
  if (await pathExists(join(cwd, "yarn.lock"))) {
    return "✓ package manager detected: yarn";
  }
  if (await pathExists(join(cwd, "package-lock.json"))) {
    return "✓ package manager detected: npm";
  }

  const packageJson = await readPackageJson(cwd);
  if (typeof packageJson?.packageManager === "string") {
    return `✓ package manager detected: ${packageJson.packageManager}`;
  }

  return "! package manager not detected";
}

async function sdkInstalledLine(cwd: string): Promise<string> {
  const packageJson = await readPackageJson(cwd);
  if (packageJson === undefined) {
    return "! package.json not found; install @enforra/sdk-node when adding enforcement";
  }

  const dependencies = readRecord(packageJson.dependencies);
  const devDependencies = readRecord(packageJson.devDependencies);
  if (
    dependencies["@enforra/sdk-node"] !== undefined ||
    devDependencies["@enforra/sdk-node"] !== undefined
  ) {
    return "✓ @enforra/sdk-node installed";
  }

  return "! @enforra/sdk-node not found in package.json";
}

async function readPackageJson(cwd: string): Promise<Record<string, unknown> | undefined> {
  const contents = await readOptionalFile(join(cwd, "package.json"));
  if (contents === undefined) {
    return undefined;
  }

  const parsed = JSON.parse(contents) as unknown;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

function parseOptions(args: string[], spec: OptionSpec): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  const allowedFlags = new Set(spec.flags ?? []);
  const allowedValues = new Set(spec.values ?? []);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (allowedFlags.has(arg)) {
      flags.add(arg);
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
      const suggestion = spec.suggestions?.[arg];
      throw new Error(
        `Unsupported option for ${spec.commandName}: ${arg}${suggestion === undefined ? "" : `. ${suggestion}`}`
      );
    }

    positionals.push(arg);
  }

  return { values, flags, positionals };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const pathStat = await stat(path);
    return pathStat.isDirectory();
  } catch {
    return false;
  }
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getDecision(record: Record<string, unknown>, key: string): AuditDecision | undefined {
  const value = record[key];
  return typeof value === "string" ? parseOptionalAuditDecision(value) : undefined;
}

function parseOptionalAuditDecision(decision: string): AuditDecision | undefined {
  if (
    decision === "allow" ||
    decision === "block" ||
    decision === "require_approval" ||
    decision === "log_only"
  ) {
    return decision;
  }

  return undefined;
}

function removeUndefinedProperties(event: SafeAuditEvent): SafeAuditEvent {
  return Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined)
  ) as SafeAuditEvent;
}

function redactSensitiveText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value
    .replace(/\bBearer\s+[-._~+/A-Za-z0-9]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(token|api_key|apikey|authorization|password|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/\bsk_[A-Za-z0-9_=-]+/g, "[REDACTED]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeMajorVersion(): number {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  return Number.isNaN(major) ? 0 : major;
}

const starterPolicy = `version: 1
defaults:
  decision: block
policies:
  - id: block-production-customer-delete
    priority: 10
    match:
      tool: db.deleteTable
    conditions:
      all:
        - field: args.table
          operator: eq
          value: customers
        - field: context.environment
          operator: eq
          value: production
    decision: block

  - id: approve-external-email
    priority: 20
    match:
      tool: email.send
    conditions:
      any:
        - field: args.recipient
          operator: not_contains
          value: "@example.com"
    decision: require_approval

  - id: log-github-issue
    priority: 30
    match:
      tool: github.create_issue
    decision: log_only
`;

const starterCases = `version: 1
cases:
  - name: blocks production customer delete
    input:
      agent: ops-agent
      tool: db.deleteTable
      args:
        table: customers
      context:
        environment: production
    expect:
      decision: block
      matchedPolicyId: block-production-customer-delete

  - name: requires approval for external email
    input:
      agent: ops-agent
      tool: email.send
      args:
        recipient: external@outside.com
    expect:
      decision: require_approval
      matchedPolicyId: approve-external-email

  - name: logs GitHub issue
    input:
      agent: ops-agent
      tool: github.create_issue
      args:
        title: Review production change
    expect:
      decision: log_only
      matchedPolicyId: log-github-issue

  - name: unknown tool defaults to block
    input:
      agent: ops-agent
      tool: unknown.tool
      args: {}
    expect:
      decision: block
`;
