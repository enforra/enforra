import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { createEnforraClient } from "@enforra/sdk-node";
import { guardMcpTool } from "@enforra/mcp";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const policyPath = resolve(__dirname, "../policy.yaml");
const auditPath = resolve(__dirname, "../.enforra/audit.jsonl");

try {
  await rm(auditPath, { force: true });
} catch {
  // Ignore
}

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

const agent = "github-agent";

// Define handlers
const getRepoStatusHandler = guardMcpTool(enforra, {
  agent,
  tool: "github.get_repo_status",
  execute: async (args: { repo: string }) => {
    return { status: "clean", branch: "feat/mcp", repo: args.repo };
  }
});

const listIssuesHandler = guardMcpTool(enforra, {
  agent,
  tool: "github.list_issues",
  execute: async () => {
    return [
      { id: 1, title: "Initial setup" },
      { id: 2, title: "Add tests" }
    ];
  }
});

const createIssueHandler = guardMcpTool(enforra, {
  agent,
  tool: "github.create_issue",
  execute: async (args: { repo: string; title: string; body: string }) => {
    return { id: 42, title: args.title, status: "open" };
  }
});

const commentHandler = guardMcpTool(enforra, {
  agent,
  tool: "github.comment",
  context: (args: { repo: string; issueId: number; body: string }) => ({
    repo_environment: args.repo.includes("prod") ? "production" : "development"
  }),
  execute: async (args: { repo: string; issueId: number; body: string }) => {
    return { id: 101, body: args.body, issueId: args.issueId };
  }
});

const mergePrHandler = guardMcpTool(enforra, {
  agent,
  tool: "github.merge_pr",
  execute: async (args: { repo: string; prNumber: number; branch: string }) => {
    return {
      merged: true,
      message: `Successfully merged PR #${args.prNumber} to branch ${args.branch}`
    };
  }
});

console.log("====================================================");
console.log("Enforra MCP GitHub Agent Demo");
console.log("====================================================\n");

// Scenario 1: safe status/list action logged or allowed
console.log("--- Scenario 1: Get Repo Status & List Issues (Log Only) ---");
const statusRes = await getRepoStatusHandler({ repo: "enforra/enforra" });
console.log(`Repo: enforra/enforra`);
console.log(`Decision: ${statusRes.decision}`);
console.log(`Executed: ${statusRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${JSON.stringify(statusRes.data)}\n`);

const listRes = await listIssuesHandler({ repo: "enforra/enforra" });
console.log(`Repo: enforra/enforra`);
console.log(`Decision: ${listRes.decision}`);
console.log(`Executed: ${listRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${JSON.stringify(listRes.data)}\n`);

// Scenario 2: issue creation requires approval
console.log("--- Scenario 2: Create Issue (Requires Approval) ---");
const createRes = await createIssueHandler({
  repo: "enforra/enforra",
  title: "Missing docs",
  body: "Please add mcp docs"
});
console.log(`Repo: enforra/enforra, Title: "Missing docs"`);
console.log(`Decision: ${createRes.decision}`);
console.log(`Executed: ${createRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${createRes.content[0]?.text}\n`);

// Scenario 3: comment allowed on non-production repo
console.log("--- Scenario 3: Add Comment on Non-Prod Repo (Allowed) ---");
const commentResDev = await commentHandler({
  repo: "enforra/enforra-dev",
  issueId: 42,
  body: "LGTM!"
});
console.log(`Repo: enforra/enforra-dev (evaluated environment: development)`);
console.log(`Decision: ${commentResDev.decision}`);
console.log(`Executed: ${commentResDev.executed ? "Yes" : "No"}`);
console.log(`Response: ${JSON.stringify(commentResDev.data)}\n`);

// Scenario 4: comment blocked on production repo (since only non-prod repos are allowed, default is block)
console.log("--- Scenario 4: Add Comment on Prod Repo (Blocked) ---");
const commentResProd = await commentHandler({
  repo: "enforra/enforra-prod",
  issueId: 42,
  body: "LGTM!"
});
console.log(`Repo: enforra/enforra-prod (evaluated environment: production)`);
console.log(`Decision: ${commentResProd.decision}`);
console.log(`Executed: ${commentResProd.executed ? "Yes" : "No"}`);
console.log(`Response: ${commentResProd.content[0]?.text}\n`);

// Scenario 5: merge PR requires approval
console.log("--- Scenario 5: Merge PR to Feature Branch (Requires Approval) ---");
const mergeResDev = await mergePrHandler({
  repo: "enforra/enforra",
  prNumber: 12,
  branch: "feat/mcp"
});
console.log(`Branch: feat/mcp`);
console.log(`Decision: ${mergeResDev.decision}`);
console.log(`Executed: ${mergeResDev.executed ? "Yes" : "No"}`);
console.log(`Response: ${mergeResDev.content[0]?.text}\n`);

// Scenario 6: merge to main blocked
console.log("--- Scenario 6: Merge PR to Main Branch (Blocked) ---");
const mergeResMain = await mergePrHandler({
  repo: "enforra/enforra",
  prNumber: 12,
  branch: "main"
});
console.log(`Branch: main`);
console.log(`Decision: ${mergeResMain.decision}`);
console.log(`Executed: ${mergeResMain.executed ? "Yes" : "No"}`);
console.log(`Response: ${mergeResMain.content[0]?.text}\n`);

console.log("====================================================");
console.log("Local Audit Log Verification");
console.log("====================================================");
try {
  const auditLogs = await readFile(auditPath, "utf-8");
  console.log(`Audit log written locally to: ${relative(process.cwd(), auditPath)}\n`);
  console.log("Audit log contents:");
  console.log(auditLogs);
} catch (err) {
  console.error("Failed to read audit log file:", err instanceof Error ? err.message : String(err));
}
