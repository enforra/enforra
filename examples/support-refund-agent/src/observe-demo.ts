import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { createEnforraClient } from "@enforra/sdk-node";

interface FakeRefundResult {
  refundId: string;
  status: "succeeded";
}

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "examples/support-refund-agent/policies/observe-policy.yaml");
const auditPath = resolve(repoRoot, ".enforra/observe-demo-audit.jsonl");

// Clean up old demo audit log if any
try {
  await rm(auditPath, { force: true });
} catch {
  // Ignore
}

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("====================================================");
indexLog("Enforra Support Refund - Observe Mode Demo");
console.log("====================================================\n");

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

  console.log(`Tool call: stripe.refund`);
  console.log(`Agent: support-agent`);
  console.log(`Amount: ${amount}`);
  console.log(`Effective Decision: ${result.decision}`);
  console.log(`Executed: ${result.executed ? "yes" : "no"}`);

  // In our typescript interface, we don't have observedDecision on EnforceToolCallResult directly
  // unless we cast it or look at the audit log, but we can verify it's allowed.
  // Let's print out what decision was observed by checking what policy matched.
  if (result.matchedPolicyId) {
    console.log(`Matched Policy: ${result.matchedPolicyId}`);
  }
  console.log("");
}

console.log("====================================================");
indexLog("Local Audit Log Verification (Observe Mode)");
console.log("====================================================");
try {
  const auditLogs = await readFile(auditPath, "utf-8");
  console.log(`Audit log written locally to: ${relative(repoRoot, auditPath)}\n`);
  console.log("Audit log contents:");
  console.log(auditLogs);
} catch (err) {
  console.error("Failed to read audit log file:", err instanceof Error ? err.message : String(err));
}

async function fakeRefund(amount: number): Promise<FakeRefundResult> {
  return {
    refundId: `ref_${amount}`,
    status: "succeeded"
  };
}

function indexLog(msg: string) {
  console.log(msg);
}
