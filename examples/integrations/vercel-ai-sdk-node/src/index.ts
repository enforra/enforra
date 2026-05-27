/**
 * Vercel AI SDK-style tool execute wrapper pattern with Enforra policy enforcement.
 *
 * This example shows how Enforra wraps a Vercel AI SDK-style tool execute
 * function. No real Vercel AI SDK, LLM provider, or API key is required.
 * The pattern is the same: Enforra evaluates policy before the tool body runs.
 */

import { createEnforraClient, type EnforceToolCallResult } from "@enforra/sdk-node";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const exampleDir = join(__dirname, "..");

async function main() {
  const enforra = await createEnforraClient({
    policyPath: join(exampleDir, "policy.yaml"),
    auditPath: join(exampleDir, ".enforra", "audit.jsonl"),
    agent: "coding-agent"
  });

  console.log("=".repeat(56));
  console.log("Enforra + Vercel AI SDK-Style Tool Execute Wrapper");
  console.log("=".repeat(56));

  // --- Tool 1: filesystem.read (safe path → allow) ---
  const result1 = await enforra.enforceToolCall({
    agent: "coding-agent",
    tool: "filesystem.read",
    args: { path: "/workspace/src/app.ts" },
    context: { environment: "development" },
    execute: async () => ({ content: "// main application code" })
  });
  printResult("filesystem.read", { path: "/workspace/src/app.ts" }, result1);

  // --- Tool 2: filesystem.read (.env → block) ---
  const result2 = await enforra.enforceToolCall({
    agent: "coding-agent",
    tool: "filesystem.read",
    args: { path: "/workspace/.env" },
    context: { environment: "development" },
    execute: async () => ({ content: "SECRET_KEY=abc123" })
  });
  printResult("filesystem.read", { path: "/workspace/.env" }, result2);

  // --- Tool 3: terminal.run (→ require_approval) ---
  const result3 = await enforra.enforceToolCall({
    agent: "coding-agent",
    tool: "terminal.run",
    args: { command: "npm install express" },
    context: { environment: "development" },
    execute: async () => ({ exitCode: 0, stdout: "added 1 package" })
  });
  printResult("terminal.run", { command: "npm install express" }, result3);

  // --- Tool 4: support.refund (small → allow) ---
  const result4 = await enforra.enforceToolCall({
    agent: "coding-agent",
    tool: "support.refund",
    args: { amount: 25, customerId: "cus_123" },
    context: { environment: "development" },
    execute: async () => ({ refundId: "ref_small", status: "succeeded" })
  });
  printResult("support.refund", { amount: 25 }, result4);

  // --- Tool 5: support.refund (large → block) ---
  const result5 = await enforra.enforceToolCall({
    agent: "coding-agent",
    tool: "support.refund",
    args: { amount: 500, customerId: "cus_456" },
    context: { environment: "development" },
    execute: async () => ({ refundId: "ref_large", status: "succeeded" })
  });
  printResult("support.refund", { amount: 500 }, result5);

  console.log(`\nAudit log written to ${join(exampleDir, ".enforra", "audit.jsonl")}`);
}

function printResult(
  tool: string,
  args: Record<string, unknown>,
  result: EnforceToolCallResult<unknown>
) {
  console.log(`\n--- Tool: ${tool} ---`);
  console.log(`Args: ${JSON.stringify(args)}`);
  console.log(`Decision: ${result.decision}`);

  let status = "failed";
  if (result.executed && result.ok) {
    status = "executed";
  } else if (result.decision === "block") {
    status = "blocked";
  } else if (result.decision === "require_approval") {
    status = "pending_approval";
  }

  console.log(`Executed: ${result.executed ? "yes" : "no"}`);
  console.log(`Status: ${status}`);
  if (result.reason) {
    console.log(`Reason: ${result.reason}`);
  }
}

main().catch(console.error);
