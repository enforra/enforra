import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient } from "@enforra/sdk-node";

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/openai-style-agent.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

console.log("Enforra OpenAI-style tool wrapper demo\n");

interface ToolCallItem {
  tool: string;
  args: Record<string, unknown>;
  context: Record<string, unknown>;
  execute: () => Promise<unknown>;
}

const toolCalls: ToolCallItem[] = [
  {
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
  },
  {
    tool: "email.send",
    args: {
      recipient: "external@example.com",
      subject: "Status update"
    },
    context: {
      environment: "production"
    },
    execute: async () => {
      return {
        messageId: "msg_123"
      };
    }
  },
  {
    tool: "customer.export",
    args: {
      segment: "enterprise"
    },
    context: {
      environment: "production"
    },
    execute: async () => {
      return {
        exportId: "export_123"
      };
    }
  }
];

for (const toolCall of toolCalls) {
  const result = await enforra.enforceToolCall({
    agent: "coding-agent",
    tool: toolCall.tool,
    args: toolCall.args,
    context: toolCall.context,
    execute: toolCall.execute
  });

  console.log(`Tool call: ${toolCall.tool}`);
  console.log("Agent: coding-agent");
  console.log(`Decision: ${result.decision}`);
  console.log(`Executed: ${result.executed ? "yes" : "no"}`);

  if (!result.ok) {
    console.log(`Reason: ${result.reason}`);
  }

  console.log("");
}

console.log("Audit log written to .enforra/audit.jsonl");
