/**
 * Vercel AI SDK Integration Example with Enforra policy enforcement.
 *
 * This example uses the actual 'ai' package tool abstraction to show
 * how Enforra wraps tool execution callbacks before side effects occur.
 */

import { createEnforraClient, type EnforceToolCallResult } from "@enforra/sdk-node";
import { tool } from "ai";
import { z } from "zod";
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
  console.log("Enforra + Vercel AI SDK Tool Integration Example");
  console.log("=".repeat(56));

  // Define actual Vercel AI SDK tools
  const filesystemRead = tool({
    description: "Read a file from the filesystem",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      return enforra.enforceToolCall({
        agent: "coding-agent",
        tool: "filesystem.read",
        args: { path },
        context: { environment: "development" },
        execute: async () => ({ content: "// main application code" })
      });
    }
  });

  const terminalRun = tool({
    description: "Run a command in the terminal",
    parameters: z.object({ command: z.string() }),
    execute: async ({ command }) => {
      return enforra.enforceToolCall({
        agent: "coding-agent",
        tool: "terminal.run",
        args: { command },
        context: { environment: "development" },
        execute: async () => ({ exitCode: 0, stdout: "added 1 package" })
      });
    }
  });

  const supportRefund = tool({
    description: "Issue a customer refund",
    parameters: z.object({ amount: z.number(), customerId: z.string() }),
    execute: async ({ amount, customerId }) => {
      return enforra.enforceToolCall({
        agent: "coding-agent",
        tool: "support.refund",
        args: { amount, customerId },
        context: { environment: "development" },
        execute: async () => ({ refundId: "ref_id", status: "succeeded" })
      });
    }
  });

  // --- Tool 1: filesystem.read (safe path → allow) ---
  const result1 = await filesystemRead.execute({ path: "/workspace/src/app.ts" });
  printResult("filesystem.read", { path: "/workspace/src/app.ts" }, result1);

  // --- Tool 2: filesystem.read (.env → block) ---
  const result2 = await filesystemRead.execute({ path: "/workspace/.env" });
  printResult("filesystem.read", { path: "/workspace/.env" }, result2);

  // --- Tool 3: terminal.run (→ require_approval) ---
  const result3 = await terminalRun.execute({ command: "npm install express" });
  printResult("terminal.run", { command: "npm install express" }, result3);

  // --- Tool 4: support.refund (small → allow) ---
  const result4 = await supportRefund.execute({ amount: 25, customerId: "cus_123" });
  printResult("support.refund", { amount: 25 }, result4);

  // --- Tool 5: support.refund (large → block) ---
  const result5 = await supportRefund.execute({ amount: 500, customerId: "cus_456" });
  printResult("support.refund", { amount: 500 }, result5);

  console.log(`\nAudit log written to ${join(exampleDir, ".enforra", "audit.jsonl")}`);
}

function printResult(
  toolName: string,
  args: Record<string, unknown>,
  result: EnforceToolCallResult<unknown>
) {
  console.log(`\n--- Tool: ${toolName} ---`);
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
