import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient } from "@enforra/sdk-node";

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/coding-agent.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("Enforra OpenAI-style tool wrapper demo\n");

const result = await enforra.enforceToolCall({
  agent: "coding-agent",
  tool: "repo.search",
  args: {
    query: "createEnforraClient"
  },
  context: {
    environment: "development"
  },
  execute: async () => {
    return {
      matches: ["packages/sdk-node/src/index.ts"]
    };
  }
});

console.log("Tool call: repo.search");
console.log("Agent: coding-agent");
console.log(`Decision: ${result.decision}`);
console.log(`Executed: ${result.executed ? "yes" : "no"}`);

if (!result.ok) {
  console.log(`Reason: ${result.reason}`);
}

console.log("\nAudit log written to .enforra/audit.jsonl");
