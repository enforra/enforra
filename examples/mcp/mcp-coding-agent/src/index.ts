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

const agent = "coding-agent";

// Define handlers
const filesystemReadHandler = guardMcpTool(enforra, {
  agent,
  tool: "filesystem.read",
  execute: async (args: { path: string }) => {
    return `[Mock File Content for ${args.path}]`;
  }
});

const filesystemWriteHandler = guardMcpTool(enforra, {
  agent,
  tool: "filesystem.write",
  execute: async (args: { path: string; content: string }) => {
    return `[Successfully wrote to ${args.path}]`;
  }
});

const terminalRunHandler = guardMcpTool(enforra, {
  agent,
  tool: "terminal.run",
  execute: async (args: { command: string }) => {
    return `[Successfully executed command: ${args.command}]`;
  }
});

console.log("====================================================");
console.log("Enforra MCP Coding Agent Demo");
console.log("====================================================\n");

// Scenario 1: Safe read allowed and executed
console.log("--- Scenario 1: Safe Read (Allowed) ---");
const safeRead = await filesystemReadHandler({ path: "/safe/src/index.ts" });
console.log(`Path: /safe/src/index.ts`);
console.log(`Decision: ${safeRead.decision}`);
console.log(`Executed: ${safeRead.executed ? "Yes" : "No"}`);
console.log(`Response: ${safeRead.content[0]?.text}\n`);

// Scenario 2: .env read blocked and not executed
console.log("--- Scenario 2: Sensitive Read (.env Blocked) ---");
const envRead = await filesystemReadHandler({ path: "/app/.env" });
console.log(`Path: /app/.env`);
console.log(`Decision: ${envRead.decision}`);
console.log(`Executed: ${envRead.executed ? "Yes" : "No"}`);
console.log(`Response: ${envRead.content[0]?.text}\n`);

// Scenario 3: Private key read blocked and not executed
console.log("--- Scenario 3: Sensitive Read (Private Key Blocked) ---");
const keyRead = await filesystemReadHandler({ path: "/user/.ssh/id_rsa" });
console.log(`Path: /user/.ssh/id_rsa`);
console.log(`Decision: ${keyRead.decision}`);
console.log(`Executed: ${keyRead.executed ? "Yes" : "No"}`);
console.log(`Response: ${keyRead.content[0]?.text}\n`);

// Scenario 4: File write requires approval and not executed
console.log("--- Scenario 4: File Write (Requires Approval) ---");
const writeRes = await filesystemWriteHandler({
  path: "/safe/new-file.ts",
  content: "console.log('hello')"
});
console.log(`Path: /safe/new-file.ts`);
console.log(`Decision: ${writeRes.decision}`);
console.log(`Executed: ${writeRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${writeRes.content[0]?.text}\n`);

// Scenario 5: npm install requires approval and not executed
console.log("--- Scenario 5: Package Install (Requires Approval) ---");
const installRes = await terminalRunHandler({ command: "npm install @enforra/mcp" });
console.log(`Command: npm install @enforra/mcp`);
console.log(`Decision: ${installRes.decision}`);
console.log(`Executed: ${installRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${installRes.content[0]?.text}\n`);

// Scenario 6: rm -rf blocked and not executed
console.log("--- Scenario 6: Dangerous Command (Blocked) ---");
const rmRes = await terminalRunHandler({ command: "rm -rf /usr/bin" });
console.log(`Command: rm -rf /usr/bin`);
console.log(`Decision: ${rmRes.decision}`);
console.log(`Executed: ${rmRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${rmRes.content[0]?.text}\n`);

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
