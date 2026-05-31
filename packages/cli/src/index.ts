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
  audit verify     Verify hash-chain audit log integrity
  doctor           Check local setup`;
}

async function runInit(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">
): Promise<number> {
  const options = parseOptions(args);
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

/**
 * Runs policy tests from specified policy and cases files, formats and prints the results, and reports failures.
 *
 * Accepts CLI-style options in `args` (recognized: `--policy`, `--cases`, `--trace`, `--json`) to locate files, enable trace mode, and select JSON output. Results are written to `stdout` (formatted) and individual test errors are written to `stderr`.
 *
 * @param args - CLI arguments for the test command
 * @param cwd - Base directory used to resolve relative file paths
 * @returns `0` if all tests passed, `1` otherwise
 */
async function runTest(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">,
  stderr: Pick<typeof console, "error">
): Promise<number> {
  const options = parseOptions(args);
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

/**
 * Verifies the integrity of a local audit log file and reports the outcome.
 *
 * @param args - CLI arguments; supports `--path` to specify the audit log file (otherwise uses the default path)
 * @param cwd - Working directory used to resolve relative paths
 * @param stdout - Logger used for informational output
 * @param stderr - Logger used for error output
 * @returns `0` if the audit log exists and is valid, `1` otherwise
 */
async function runAuditVerify(
  args: string[],
  cwd: string,
  stdout: Pick<typeof console, "log">,
  stderr: Pick<typeof console, "error">
): Promise<number> {
  const options = parseOptions(args);
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

/**
 * Parse a CLI-style arguments array into value options, boolean flags, and positional arguments.
 *
 * @param args - The array of command-line arguments to parse.
 * @returns An object with:
 *  - `values`: Map of options that require a value (e.g. `--policy`, `--cases`, `--path`) to their supplied value.
 *  - `flags`: Set of boolean flags present (e.g. `--force`, `--trace`, `--json`).
 *  - `positionals`: Array of remaining non-option arguments in order.
 * @throws Error if an option that requires a value is missing its value or if an unknown `--` option is encountered.
 */
function parseOptions(args: string[]): ParsedOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--force" || arg === "--trace" || arg === "--json") {
      flags.add(arg);
      continue;
    }

    if (arg === "--policy" || arg === "--cases" || arg === "--path") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      values.set(arg, value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
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
