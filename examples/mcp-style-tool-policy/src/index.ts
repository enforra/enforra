import { createEnforraClient } from "@enforra/sdk-node";

async function main() {
  const enforra = await createEnforraClient({
    policyPath: "../../policies/starter/mcp-style-tools.yaml",
    auditPath: ".enforra/mcp-style-audit.jsonl"
  });

  console.log("Enforra MCP-style policy demo (application boundary, not MCP proxy)\n");

  const calls = [
    { tool: "filesystem.read", args: { path: "./docs/quickstart.md" } },
    { tool: "filesystem.read", args: { path: "./.env" } },
    { tool: "terminal.run", args: { command: "npm install" } },
    { tool: "filesystem.delete", args: { path: "./docs/old.md" } },
    { tool: "github.create_issue", args: { repo: "owner/repo", title: "Docs update" } }
  ];

  for (const call of calls) {
    const result = await enforra.enforceToolCall({
      agent: "mcp-style-agent",
      tool: call.tool,
      args: call.args,
      execute: async () => ({ ok: true, simulated: true })
    });

    console.log(`Tool call: ${call.tool}`);
    console.log(`Decision: ${result.decision}`);
    console.log(`Executed: ${result.executed ? "yes" : "no"}`);
    if (result.reason) console.log(`Reason: ${result.reason}`);
    console.log();
  }

  console.log("Audit log written to .enforra/mcp-style-audit.jsonl");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
