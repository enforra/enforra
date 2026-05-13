import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient } from "@enforra/sdk-node";

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/mcp-tools.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("Enforra MCP-style tool policy demo\n");

for (const toolCall of [
  {
    tool: "mcp.read",
    args: { server: "docs", approved: true }
  },
  {
    tool: "mcp.write",
    args: { server: "docs", approved: true }
  },
  {
    tool: "shell.execute",
    args: { server: "terminal", command: "rm -rf /tmp/example", approved: true }
  }
] as const) {
  const result = await enforra.enforceToolCall({
    agent: "mcp-agent",
    tool: toolCall.tool,
    args: toolCall.args,
    context: {
      environment: "development"
    },
    execute: async () => {
      return {
        status: "completed"
      };
    }
  });

  console.log(`Tool call: ${toolCall.tool}`);
  console.log("Agent: mcp-agent");
  console.log(`Decision: ${result.decision}`);
  console.log(`Executed: ${result.executed ? "yes" : "no"}`);

  if (!result.ok) {
    console.log(`Reason: ${result.reason}`);
  }

  console.log("");
}

console.log("Audit log written to .enforra/audit.jsonl");
