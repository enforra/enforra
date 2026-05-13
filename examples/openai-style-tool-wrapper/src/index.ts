import { createEnforraClient } from "@enforra/sdk-node";

async function main() {
  const enforra = await createEnforraClient({
    policyPath: "../../policies/starter/openai-style-agent.yaml",
    auditPath: ".enforra/openai-style-audit.jsonl"
  });

  console.log("Enforra OpenAI-style tool wrapper demo (local mock, no API call)\n");

  const mockToolCalls = [
    { tool: "crm.lookup", args: { accountId: "acct_123", scope: "read" } },
    { tool: "email.send", args: { to: "external@example.com", subject: "Follow up" } },
    { tool: "customer.export", args: { format: "csv" }, context: { environment: "production" } }
  ];

  for (const call of mockToolCalls) {
    const result = await enforra.enforceToolCall({
      agent: "openai-style-agent",
      tool: call.tool,
      args: call.args,
      context: call.context,
      execute: async () => ({ ok: true, simulated: true })
    });

    console.log(`Tool call: ${call.tool}`);
    console.log(`Decision: ${result.decision}`);
    console.log(`Executed: ${result.executed ? "yes" : "no"}`);
    if (result.reason) console.log(`Reason: ${result.reason}`);
    console.log();
  }

  console.log("Audit log written to .enforra/openai-style-audit.jsonl");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
