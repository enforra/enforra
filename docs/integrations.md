# Framework Integration Patterns

Enforra works best at the application callback boundary. You keep your framework. Enforra wraps the function that creates the side effect.

These examples are illustrative integration patterns, not official framework adapters. They use fake local functions only: no real Stripe, OpenAI, network, or secrets.

Create the Enforra client once at startup and share the instance across your tool definitions.

## Scope

Enforra is not a gateway, MCP proxy, model firewall, or hosted platform. It is a local SDK for action governance around tool callbacks.

## OpenAI Agents-Style Tool Callback

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

async function createLocalRefund(args: { customerId: string; amount: number }) {
  return { refundId: "local_refund_123", ...args };
}

export const refundTool = {
  name: "stripe.refund",
  execute: async (args: { customerId: string; amount: number }) => {
    return enforra.enforceToolCall({
      agent: "support-agent",
      tool: "stripe.refund",
      args,
      context: { environment: "development" },
      execute: () => createLocalRefund(args)
    });
  }
};
```

## Vercel AI SDK Tool

```ts
import { tool } from "ai";
import { z } from "zod";
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

async function sendLocalEmail(args: { recipient: string; subject: string }) {
  return { messageId: "local_message_123", ...args };
}

export const emailTool = tool({
  description: "Send a local mock email",
  parameters: z.object({
    recipient: z.string(),
    subject: z.string()
  }),
  execute: async (args) => {
    return enforra.enforceToolCall({
      agent: "support-agent",
      tool: "email.send",
      args,
      context: { channel: "support" },
      execute: () => sendLocalEmail(args)
    });
  }
});
```

## LangChain-Style Tool

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

async function updateLocalTicket(args: { ticketId: string; status: string }) {
  return { updated: true, ...args };
}

export const updateTicketTool = {
  name: "ticket.update",
  description: "Update a local mock support ticket",
  func: async (args: { ticketId: string; status: string }) => {
    return enforra.enforceToolCall({
      agent: "support-agent",
      tool: "ticket.update",
      args,
      context: { queue: "tier-1" },
      execute: () => updateLocalTicket(args)
    });
  }
};
```

## LangGraph-Style Node or Tool

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

async function writeLocalAccountNote(args: { accountId: string; note: string }) {
  return { noteId: "local_note_123", ...args };
}

export async function accountNoteNode(state: { accountId: string; note: string; runId: string }) {
  const args = { accountId: state.accountId, note: state.note };

  return enforra.enforceToolCall({
    agent: "support-agent",
    tool: "account.note.create",
    args,
    context: { runId: state.runId },
    execute: () => writeLocalAccountNote(args)
  });
}
```

In every pattern, the framework plans and routes as usual. Enforra only calls `execute` when policy returns `allow` or `log_only`. A `block` or `require_approval` decision returns without calling `execute`. The result includes the decision, reason, and matched policy ID so the calling code can handle it appropriately.
