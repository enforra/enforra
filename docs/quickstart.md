# Quickstart

```bash
pnpm install
pnpm build
pnpm test
pnpm demo:support-refund
```

Create a client:

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});
```

Wrap a tool call:

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml"
});

await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: { amount: 20 },
  execute: async () => refundCustomer()
});
```
