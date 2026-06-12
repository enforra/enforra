import { createEnforraClient, type EnforceToolCallResult } from "@enforra/sdk-node";
import { tool } from "ai";
import { z } from "zod";

export interface DemoResult {
  tool: string;
  args: Record<string, unknown>;
  decision: string;
  executed: boolean;
  status: string;
  reason: string;
}

export async function runVercelAIDemo(
  policyPath: string,
  auditPath: string
): Promise<DemoResult[]> {
  const enforra = await createEnforraClient({
    policyPath,
    auditPath,
    agent: "coding-agent"
  });

  // Define actual Vercel AI SDK tools
  const filesystemRead = tool({
    description: "Read a file from the filesystem",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      return enforra.enforceToolCall({
        agent: "coding-agent",
        tool: "filesystem.read",
        args: { path },
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
        execute: async () => ({ exitCode: 0, stdout: "added 1 package" })
      });
    }
  });

  const githubCreateIssue = tool({
    description: "Create a GitHub issue",
    parameters: z.object({ title: z.string(), repo: z.string() }),
    execute: async ({ title, repo }) => {
      return enforra.enforceToolCall({
        agent: "coding-agent",
        tool: "github.create_issue",
        args: { title, repo },
        execute: async () => ({ issueNumber: 101, url: `https://github.com/${repo}/issues/101` })
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
        execute: async () => ({ refundId: "ref_ok", status: "succeeded" })
      });
    }
  });

  const results: DemoResult[] = [];

  const addResult = (
    toolName: string,
    args: Record<string, unknown>,
    res: EnforceToolCallResult<unknown>
  ) => {
    let status = "failed";
    if (res.executed && res.ok) {
      status = res.decision === "log_only" ? "logged" : "executed";
    } else if (res.decision === "block") {
      status = "blocked";
    } else if (res.decision === "require_approval") {
      status = "pending_approval";
    }

    results.push({
      tool: toolName,
      args,
      decision: res.decision,
      executed: res.executed,
      status,
      reason: res.reason || ""
    });
  };

  // 1. Safe file read
  const r1 = await filesystemRead.execute({ path: "/workspace/src/app.ts" });
  addResult(
    "filesystem.read",
    { path: "/workspace/src/app.ts" },
    r1 as EnforceToolCallResult<unknown>
  );

  // 2. .env read
  const r2 = await filesystemRead.execute({ path: "/workspace/.env" });
  addResult("filesystem.read", { path: "/workspace/.env" }, r2 as EnforceToolCallResult<unknown>);

  // 3. terminal command
  const r3 = await terminalRun.execute({ command: "npm install express" });
  addResult(
    "terminal.run",
    { command: "npm install express" },
    r3 as EnforceToolCallResult<unknown>
  );

  // 4. GitHub issue
  const r4 = await githubCreateIssue.execute({ title: "Fix login bug", repo: "acme/app" });
  addResult(
    "github.create_issue",
    { title: "Fix login bug", repo: "acme/app" },
    r4 as EnforceToolCallResult<unknown>
  );

  // 5. Small refund
  const r5 = await supportRefund.execute({ amount: 25, customerId: "cus_123" });
  addResult(
    "support.refund",
    { amount: 25, customerId: "cus_123" },
    r5 as EnforceToolCallResult<unknown>
  );

  // 6. Large refund
  const r6 = await supportRefund.execute({ amount: 150, customerId: "cus_456" });
  addResult(
    "support.refund",
    { amount: 150, customerId: "cus_456" },
    r6 as EnforceToolCallResult<unknown>
  );

  return results;
}
