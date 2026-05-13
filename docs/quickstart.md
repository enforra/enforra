# Quickstart

```bash
pnpm install
pnpm build
pnpm test
pnpm demo:support-refund
```

Optional demos:

```bash
pnpm demo:openai-style
pnpm demo:mcp-style
pnpm demo:all
```

Create a client:

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/my-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});
```

Wrap a tool call:

```ts
await enforra.enforceToolCall({
  agent: "research-agent",
  tool: "crm.lookup",
  args: { accountId: "acct_123" },
  execute: async () => lookupAccount()
});
```
