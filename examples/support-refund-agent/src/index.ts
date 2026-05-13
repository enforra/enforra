import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient } from "@enforra/sdk-node";

interface FakeRefundResult {
  refundId: string;
  status: "succeeded";
}

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/support-agent.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("Enforra support refund demo\n");

const scenarios = [
  { label: "small refund", amount: 20 },
  { label: "medium refund", amount: 250 },
  { label: "large refund", amount: 1000 }
] as const;

const results = [];

for (const scenario of scenarios) {
  const result = await enforra.enforceToolCall<FakeRefundResult>({
    agent: "support-agent",
    tool: "stripe.refund",
    args: {
      customerId: "cus_123",
      amount: scenario.amount
    },
    context: {
      environment: "production"
    },
    execute: async () => fakeRefund(scenario.amount)
  });

  results.push({ ...scenario, result });
}

for (const { label, result } of results) {
  const outcome =
    result.decision === "require_approval" ? "requires approval" : `${result.decision}ed`;
  console.log(`${label} ${outcome}`);
}

console.log("audit log written locally\n");

for (const { amount, result } of results) {
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
