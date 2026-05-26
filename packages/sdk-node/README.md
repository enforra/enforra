# @enforra/sdk-node

Node.js SDK wrapper for enforcing Enforra policy decisions around tool calls.

## Installation

```bash
npm install @enforra/sdk-node
```

## Usage

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

const result = await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: { amount: 20 },
  execute: async () => ({ status: "succeeded" })
});
```

### Hash-Chain Audit

For tamper-evident local audit logs:

```ts
const enforra = await createEnforraClient({
  policyPath,
  auditPath,
  auditIntegrity: "hash_chain"
});
```

See [Audit Integrity](../../docs/audit-integrity.md) for more details.
