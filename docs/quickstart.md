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
  policyPath: "./policies/my-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});
```

Wrap a tool call:

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/my-agent.yaml"
});

await enforra.enforceToolCall({
  agent: "research-agent",
  tool: "crm.lookup",
  args: { accountId: "acct_123" },
  execute: async () => lookupAccount()
});
```

Starter policies in `policies/starter` are examples. They are not required runtime configuration, and the SDK is not hardcoded to them. The SDK accepts any local YAML policy path that matches the policy schema.
