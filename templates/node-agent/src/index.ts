import { createEnforraClient } from "@enforra/sdk-node";

// 1. Initialize Enforra client loaded with our local policy
const client = await createEnforraClient({
  policyPath: "./policy.yaml"
});

// 2. Define a tool function wrapped with Enforra policy enforcement
async function refundTool(args: { amount: number }) {
  return client.enforceToolCall({
    agent: "support-agent",
    tool: "support.refund",
    args,
    execute: async () => {
      console.log(`[Stripe API] Processing refund of $${args.amount}...`);
      return { success: true, refundedAmount: args.amount };
    }
  });
}

// 3. Simulate tool calls
console.log("--- Scenario 1: Small Refund ($25, Allowed) ---");
try {
  const result = await refundTool({ amount: 25 });
  console.log("Decision:", result.decision);
  console.log("Executed:", result.executed ? "yes" : "no");
  if (result.ok) {
    console.log("Result data:", result.data);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Blocked/Failed:", message);
}

console.log("\n--- Scenario 2: Medium Refund ($150, Requires Approval) ---");
try {
  const result = await refundTool({ amount: 150 });
  console.log("Decision:", result.decision);
  console.log("Executed:", result.executed ? "yes" : "no");
  if (result.reason) {
    console.log("Reason:", result.reason);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Blocked/Failed:", message);
}

console.log("\n--- Scenario 3: Large Refund ($800, Blocked) ---");
try {
  const result = await refundTool({ amount: 800 });
  console.log("Decision:", result.decision);
  console.log("Executed:", result.executed ? "yes" : "no");
  if (result.reason) {
    console.log("Reason:", result.reason);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Blocked/Failed:", message);
}
