import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient } from "@enforra/sdk-node";

interface FakeRefundResult {
  refundId: string;
  status: "succeeded";
}

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/support-agent.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("Enforra support refund demo\n");

for (const amount of [20, 250, 1000]) {
  const result = await enforra.enforceToolCall<FakeRefundResult>({
    agent: "support-agent",
    tool: "stripe.refund",
    args: {
      customerId: "cus_123",
      amount
    },
    context: {
      environment: "production"
    },
    execute: async () => fakeRefund(amount)
  });

  console.log("Tool call: stripe.refund");
  console.log("Agent: support-agent");
  console.log(`Amount: ${amount}`);
  console.log(`Decision: ${result.decision}`);
  console.log(`Executed: ${result.executed ? "yes" : "no"}`);

  if (!result.ok) {
    console.log(`Reason: ${result.reason}`);
  }

  console.log("");
}

console.log("Audit log written to .enforra/audit.jsonl");

async function fakeRefund(amount: number): Promise<FakeRefundResult> {
  return {
    refundId: `ref_${amount}`,
    status: "succeeded"
  };
}
