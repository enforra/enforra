import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { createEnforraClient } from "@enforra/sdk-node";
import { guardMcpTool } from "@enforra/mcp";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/mcp-tools.yaml");
const auditPath = resolve(repoRoot, ".enforra/mcp-demo-audit.jsonl");

// Clean up old demo audit log if any
try {
  await rm(auditPath, { force: true });
} catch {
  // Ignore
}

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("====================================================");
console.log("Enforra MCP Tool Guard Demo");
console.log("====================================================\n");

// Define fake MCP-style tools and wrap them with Enforra policies
const filesystemReadHandler = guardMcpTool(enforra, {
  agent: "mcp-agent",
  tool: "mcp.filesystem.read",
  execute: async (args: { path: string }) => {
    return `[Mock File Content for ${args.path}]`;
  }
});

const filesystemWriteHandler = guardMcpTool(enforra, {
  agent: "mcp-agent",
  tool: "mcp.filesystem.write",
  execute: async (args: { path: string; content: string }) => {
    return `[Successfully wrote to ${args.path}]`;
  }
});

const shellRunHandler = guardMcpTool(enforra, {
  agent: "mcp-agent",
  tool: "mcp.shell.run",
  context: (args: { command: string; isProd: boolean }) => ({
    environment: args.isProd ? "production" : "development"
  }),
  execute: async (args: { command: string; isProd: boolean }) => {
    return `[Successfully ran command: ${args.command}]`;
  }
});

// Run scenarios
console.log("--- Scenario 1: Run mcp.shell.run in PRODUCTION ---");
const shellResultProd = await shellRunHandler({ command: "rm -rf /", isProd: true });
console.log("Arguments passed: { command: 'rm -rf /', isProd: true }");
console.log("Context environment evaluated as: production");
console.log(`Decision: ${shellResultProd.decision}`);
console.log(`Executed: ${shellResultProd.executed ? "Yes" : "No"}`);
console.log(`Response: ${shellResultProd.content[0]?.text}`);
console.log("");

console.log("--- Scenario 2: Run mcp.filesystem.write (Requires Approval) ---");
const writeResult = await filesystemWriteHandler({ path: "/safe/app.log", content: "log data" });
console.log("Arguments passed: { path: '/safe/app.log', content: 'log data' }");
console.log(`Decision: ${writeResult.decision}`);
console.log(`Executed: ${writeResult.executed ? "Yes" : "No"}`);
console.log(`Response: ${writeResult.content[0]?.text}`);
console.log("");

console.log("--- Scenario 3: Run mcp.filesystem.read (Safe path - containing /safe/) ---");
const readResultSafe = await filesystemReadHandler({ path: "/safe/config.json" });
console.log("Arguments passed: { path: '/safe/config.json' }");
console.log(`Decision: ${readResultSafe.decision}`);
console.log(`Executed: ${readResultSafe.executed ? "Yes" : "No"}`);
console.log(`Response: ${readResultSafe.content[0]?.text}`);
console.log("");

console.log("--- Scenario 4: Run mcp.filesystem.read (Unsafe path - defaults to block) ---");
const readResultUnsafe = await filesystemReadHandler({ path: "/etc/passwd" });
console.log("Arguments passed: { path: '/etc/passwd' }");
console.log(`Decision: ${readResultUnsafe.decision}`);
console.log(`Executed: ${readResultUnsafe.executed ? "Yes" : "No"}`);
console.log(`Response: ${readResultUnsafe.content[0]?.text}`);
console.log("");

console.log("====================================================");
console.log("Local Audit Log Verification");
console.log("====================================================");
try {
  const auditLogs = await readFile(auditPath, "utf-8");
  console.log(`Audit log written locally to: ${relative(repoRoot, auditPath)}\n`);
  console.log("Audit log contents:");
  console.log(auditLogs);
} catch (err) {
  console.error("Failed to read audit log file:", err instanceof Error ? err.message : String(err));
}
