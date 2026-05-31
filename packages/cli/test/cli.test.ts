import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { createLocalAuditLogger } from "@enforra/local-audit";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

describe("cli", () => {
  it("init creates starter files", async () => {
    const dir = await createTempDir();
    const output = createOutput();

    const exitCode = await runCli(["init"], { cwd: dir, stdout: output.stdout });

    expect(exitCode).toBe(0);
    await expect(readFile(join(dir, "policies/enforra.yaml"), "utf8")).resolves.toContain(
      "block-production-customer-delete"
    );
    await expect(readFile(join(dir, "policies/enforra.cases.yaml"), "utf8")).resolves.toContain(
      "blocks production customer delete"
    );
    expect(output.lines.join("\n")).toContain("Created:");
  });

  it("init does not overwrite existing files without --force", async () => {
    const dir = await createTempDir();
    const policyPath = join(dir, "policies/enforra.yaml");
    const casesPath = join(dir, "policies/enforra.cases.yaml");
    await mkdir(join(dir, "policies"), { recursive: true });
    await writeFile(policyPath, "existing policy", "utf8");
    await writeFile(casesPath, "existing cases", "utf8");
    const output = createOutput();

    const exitCode = await runCli(["init"], {
      cwd: dir,
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    await expect(readFile(policyPath, "utf8")).resolves.toBe("existing policy");
    await expect(readFile(casesPath, "utf8")).resolves.toBe("existing cases");
  });

  it("init overwrites existing files with --force", async () => {
    const dir = await createTempDir();
    const policyPath = join(dir, "policies/enforra.yaml");
    await mkdir(join(dir, "policies"), { recursive: true });
    await writeFile(policyPath, "existing policy", "utf8");

    const exitCode = await runCli(["init", "--force"], { cwd: dir, stdout: createOutput().stdout });

    expect(exitCode).toBe(0);
    await expect(readFile(policyPath, "utf8")).resolves.toContain(
      "block-production-customer-delete"
    );
  });

  it("test command passes valid cases", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    await runCli(["init"], { cwd: dir, stdout: createOutput().stdout });

    const exitCode = await runCli(["test"], { cwd: dir, stdout: output.stdout });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("Policy test results");
    expect(output.lines.join("\n")).toContain("PASS  blocks production customer delete");
    expect(output.lines.join("\n")).toContain("4 passed, 0 failed");
  });

  it("test command resolves relative --policy and --cases from cwd", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    const policyDir = join(dir, "custom");
    const policyPath = join(policyDir, "policy.yaml");
    const casesPath = join(policyDir, "cases.yaml");

    await mkdir(policyDir, { recursive: true });
    await writeFile(policyPath, starterPolicy(), "utf8");
    await writeFile(casesPath, starterCases(), "utf8");

    const exitCode = await runCli(
      ["test", "--policy", relative(dir, policyPath), "--cases", relative(dir, casesPath)],
      { cwd: dir, stdout: output.stdout }
    );

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("4 passed, 0 failed");
  });

  it("test command accepts an absolute --policy path", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    const policyDir = join(dir, "custom");
    const policyPath = join(policyDir, "policy.yaml");

    await mkdir(join(dir, "policies"), { recursive: true });
    await mkdir(policyDir, { recursive: true });
    await writeFile(policyPath, starterPolicy(), "utf8");
    await writeFile(join(dir, "policies/enforra.cases.yaml"), starterCases(), "utf8");

    const exitCode = await runCli(["test", "--policy", policyPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("4 passed, 0 failed");
  });

  it("test command accepts an absolute --cases path", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    const casesDir = join(dir, "custom");
    const casesPath = join(casesDir, "cases.yaml");

    await mkdir(join(dir, "policies"), { recursive: true });
    await mkdir(casesDir, { recursive: true });
    await writeFile(join(dir, "policies/enforra.yaml"), starterPolicy(), "utf8");
    await writeFile(casesPath, starterCases(), "utf8");

    const exitCode = await runCli(["test", "--cases", casesPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("4 passed, 0 failed");
  });

  it("test command exits non-zero for failing cases", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    await writePolicyFiles(
      dir,
      starterPolicy(),
      `version: 1
cases:
  - name: wrong expected decision
    input:
      agent: ops-agent
      tool: db.deleteTable
      args:
        table: customers
      context:
        environment: production
    expect:
      decision: allow
`
    );

    const exitCode = await runCli(["test"], {
      cwd: dir,
      stdout: output.stdout,
      stderr: output.stderr
    });

    expect(exitCode).toBe(1);
    expect(output.lines.join("\n")).toContain("0 passed, 1 failed");
    expect(output.errors.join("\n")).toContain("expected decision allow, received block");
  });

  it("audit verify passes valid hash-chain log", async () => {
    const dir = await createTempDir();
    const auditPath = join(dir, ".enforra/audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });
    const output = createOutput();

    await logger.append({
      agent: "ops-agent",
      tool: "db.deleteTable",
      decision: "block",
      matchedPolicyId: "block-production-customer-delete",
      status: "blocked",
      args: { table: "customers" }
    });

    const exitCode = await runCli(["audit", "verify"], { cwd: dir, stdout: output.stdout });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("Audit verification: valid");
    expect(output.lines.join("\n")).toContain("Events checked: 1");
  });

  it("audit verify accepts an absolute --path", async () => {
    const dir = await createTempDir();
    const auditDir = join(dir, "logs");
    const auditPath = join(auditDir, "audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });
    const output = createOutput();

    await logger.append({
      agent: "ops-agent",
      tool: "db.deleteTable",
      decision: "block",
      matchedPolicyId: "block-production-customer-delete",
      status: "blocked",
      args: { table: "customers" }
    });

    const exitCode = await runCli(["audit", "verify", "--path", auditPath], {
      cwd: dir,
      stdout: output.stdout
    });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("Audit verification: valid");
  });

  it("audit verify fails invalid log", async () => {
    const dir = await createTempDir();
    const auditPath = join(dir, ".enforra/audit.jsonl");
    const logger = createLocalAuditLogger(auditPath, { integrity: "hash_chain" });
    const output = createOutput();

    await logger.append({
      agent: "ops-agent",
      tool: "db.deleteTable",
      decision: "block",
      status: "blocked",
      args: { table: "customers" }
    });

    const event = JSON.parse((await readFile(auditPath, "utf8")).trim()) as {
      argsRedacted: { table: string };
    };
    event.argsRedacted.table = "orders";
    await writeFile(auditPath, `${JSON.stringify(event)}\n`, "utf8");

    const exitCode = await runCli(["audit", "verify"], { cwd: dir, stdout: output.stdout });

    expect(exitCode).toBe(1);
    expect(output.lines.join("\n")).toContain("Audit verification: invalid");
    expect(output.lines.join("\n")).toContain("First invalid line: 1");
  });

  it("doctor runs without throwing", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { "@enforra/sdk-node": "0.1.0" } }),
      "utf8"
    );
    await writeFile(join(dir, ".gitignore"), ".enforra\n", "utf8");

    const exitCode = await runCli(["doctor"], { cwd: dir, stdout: output.stdout });

    expect(exitCode).toBe(0);
    expect(output.lines.join("\n")).toContain("Enforra doctor");
    expect(output.lines.join("\n")).toContain("✓ Node.js >=20");
  });

  it("test command outputs JSON when --json is provided", async () => {
    const dir = await createTempDir();
    const output = createOutput();
    await runCli(["init"], { cwd: dir, stdout: createOutput().stdout });

    const exitCode = await runCli(["test", "--json"], { cwd: dir, stdout: output.stdout });

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(output.lines.join("\n"));
    expect(parsed.total).toBe(4);
    expect(parsed.passed).toBe(4);
    expect(parsed.failed).toBe(0);
    expect(parsed.cases).toHaveLength(4);
    expect(parsed.cases[0].name).toBe("blocks production customer delete");
    expect(parsed.cases[0].expected).toBe("block");
    expect(parsed.cases[0].actual).toBe("block");
    expect(parsed.cases[0].passed).toBe(true);
  });
});

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "enforra-cli-"));
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
    stdout: {
      log: (message: string) => lines.push(message)
    },
    stderr: {
      error: (message: string) => errors.push(message)
    }
  };
}

async function writePolicyFiles(dir: string, policy: string, cases: string): Promise<void> {
  await mkdir(join(dir, "policies"), { recursive: true });
  await writeFile(join(dir, "policies/enforra.yaml"), policy, "utf8");
  await writeFile(join(dir, "policies/enforra.cases.yaml"), cases, "utf8");
}

function starterPolicy(): string {
  return `version: 1
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
}

function starterCases(): string {
  return `version: 1
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
}
