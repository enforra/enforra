import { createEnforraClient } from "@enforra/sdk-node";
import { guardMcpTool } from "@enforra/mcp";

// 1. Initialize Enforra client loaded with local policy
// guardMcpTool internally evaluates policy checks using this client.
const client = await createEnforraClient({
  policyPath: "./policy.yaml"
});

// 2. Define MCP-style tools wrapped with Enforra policy guards.
// The handlers simulate underlying tool execution and are only called if allowed.
const readFileTool = guardMcpTool(client, {
  agent: "mcp-agent",
  tool: "filesystem.read",
  execute: async (args: { path: string }) => {
    console.log(`[Filesystem] Reading file at ${args.path}...`);
    return { content: `[Mock file content for ${args.path}]` };
  }
});

const runTerminalTool = guardMcpTool(client, {
  agent: "mcp-agent",
  tool: "terminal.run",
  execute: async (args: { command: string }) => {
    console.log(`[Terminal] Running command: ${args.command}...`);
    return { status: "success", code: 0 };
  }
});

const createIssueTool = guardMcpTool(client, {
  agent: "mcp-agent",
  tool: "github.create_issue",
  execute: async (args: { title: string }) => {
    console.log(`[GitHub API] Creating issue: "${args.title}"...`);
    return { issueId: 101, url: "https://github.com/mock/repo/issues/101" };
  }
});

// 3. Simulate client requests
console.log("--- Scenario 1: Allowed Filesystem Read (safe path) ---");
try {
  const res = await readFileTool({ path: "/workspace/src/app.ts" });
  console.log("Response:", res);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Blocked/Failed:", message);
}

console.log("\n--- Scenario 2: Blocked Filesystem Read (.env file) ---");
try {
  const res = await readFileTool({ path: "/workspace/.env" });
  console.log("Response:", res);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Blocked/Failed:", message);
}

console.log("\n--- Scenario 3: Terminal command requiring approval ---");
try {
  const res = await runTerminalTool({ command: "npm install express" });
  console.log("Response:", res);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Blocked/Failed:", message);
}

console.log("\n--- Scenario 4: GitHub task in log_only mode ---");
try {
  const res = await createIssueTool({ title: "Fix security alerts" });
  console.log("Response:", res);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Blocked/Failed:", message);
}
