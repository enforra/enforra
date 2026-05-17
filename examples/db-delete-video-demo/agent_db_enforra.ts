import { rm } from "node:fs/promises";
import { createEnforraClient } from "@enforra/sdk-node";
import { db } from "./fake-db";

await rm(".enforra/audit.jsonl", { force: true });

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/db-delete-video.yaml",
  auditPath: ".enforra/audit.jsonl"
});

await printSection(`AI agent requested:

db.deleteTable("customers")
environment: production`);

await printSection(`customers table before: ${formatRows(db.getRowCount("customers"))} rows`);

let callbackExecuted = false;

// Enforra checks policy before this callback can run.
const result = await enforra.enforceToolCall({
  agent: "ops-agent",
  tool: "db.deleteTable",
  args: { table: "customers" },
  context: { environment: "production" },

  // This destructive callback only runs if policy allows it.
  execute: async () => {
    callbackExecuted = true;
    return db.deleteTable("customers");
  }
});

await printSection(`Enforra decision: ${result.decision}
Matched policy: ${result.matchedPolicyId ?? "none"}
Callback executed: ${callbackExecuted ? "yes" : "no"}`);

await printSection(`customers table after: ${formatRows(db.getRowCount("customers"))} rows`);

await printSection("PROTECTED: customer table still intact");

console.log("Audit log written to .enforra/audit.jsonl");

async function printSection(text: string): Promise<void> {
  console.log(text);
  console.log("");
  await delay(700);
}

function formatRows(count: number): string {
  return count.toLocaleString("en-US");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
