import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAuditLog } from "@enforra/local-audit";
import { createEnforraClient } from "@enforra/sdk-node";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/support-agent.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

await rm(auditPath, { force: true });

const enforra = await createEnforraClient({
  policyPath,
  auditPath,
  auditIntegrity: "hash_chain"
});

console.log("Enforra audit integrity demo\n");

await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: {
    customerId: "cus_123",
    amount: 20
  },
  context: {
    environment: "production"
  },
  execute: async () => ({ refundId: "ref_20", status: "succeeded" })
});

await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: {
    customerId: "cus_123",
    amount: 250
  },
  context: {
    environment: "production"
  },
  execute: async () => ({ refundId: "ref_250", status: "succeeded" })
});

await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: {
    customerId: "cus_123",
    amount: 1000
  },
  context: {
    environment: "production"
  },
  execute: async () => ({ refundId: "ref_1000", status: "succeeded" })
});

const verification = await verifyAuditLog(auditPath);

console.log(`Audit verification: ${verification.valid ? "valid" : "invalid"}`);
console.log(`Events checked: ${verification.eventsChecked}`);
console.log("Audit log written to .enforra/audit.jsonl");
