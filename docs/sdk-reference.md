# SDK Reference

The Node SDK exposes a local enforcement wrapper around application-owned tool callbacks.

```ts
import { createEnforraClient } from "@enforra/sdk-node";
```

Packages are currently developed from source in this monorepo. npm publishing is not live yet.

## `createEnforraClient`

```ts
const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl",
  auditIntegrity: "hash_chain"
});
```

Options:

- `policyPath`: path to a local YAML policy file.
- `auditPath`: optional path for local JSONL audit output. Defaults to `.enforra/audit.jsonl`.
- `auditIntegrity`: optional local audit integrity mode. Defaults to `none`. Set to `hash_chain` to add SHA-256 chain metadata to each audit event.

The SDK is not hardcoded to starter policies. Pass any valid local policy path.

## `enforceToolCall`

```ts
const result = await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: {
    customerId: "cus_123",
    amount: 250
  },
  context: {
    environment: "production"
  },
  execute: async () => {
    return { refundId: "ref_123", status: "created" };
  }
});
```

Input:

- `agent`: stable agent identifier.
- `tool`: stable tool name.
- `args`: structured tool arguments.
- `context`: optional structured runtime context.
- `execute`: async callback owned by the application.

Enforra only calls `execute` when policy returns `allow` or `log_only`.

## Result: `allow`

```ts
if (result.ok && result.decision === "allow") {
  console.log(result.executed); // true
  console.log(result.data);
}
```

Behavior:

- writes `decision_logged`
- executes the callback
- writes `executed`
- returns `ok: true`, `executed: true`, and `data`

## Result: `log_only`

```ts
if (result.ok && result.decision === "log_only") {
  console.log(result.executed); // true
}
```

Behavior:

- writes `decision_logged`
- executes the callback
- writes `logged`
- returns `ok: true`, `executed: true`, and `data`

## Result: `block`

```ts
if (!result.ok && result.decision === "block") {
  console.log(result.executed); // false
  console.log(result.blocked); // true
}
```

Behavior:

- does not execute the callback
- writes `blocked`
- returns `ok: false`, `executed: false`, and `blocked: true`

## Result: `require_approval`

```ts
if (!result.ok && result.decision === "require_approval") {
  console.log(result.executed); // false
  console.log(result.approvalRequired); // true
}
```

Behavior:

- does not execute the callback
- writes `pending_approval`
- returns `ok: false`, `executed: false`, and `approvalRequired: true`

The OSS runtime does not complete an approval workflow. The application decides how to handle this result.

## Execution Failure

```ts
const result = await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: { amount: 20 },
  execute: async () => {
    throw new Error("refund failed");
  }
});

if (!result.ok && result.executed) {
  console.error(result.error);
}
```

Behavior:

- the callback was entered, so `executed` is `true`
- the original `Error` object is returned to the caller
- audit logs receive a redacted error message with status `failed`

## Audit Failure Before Execution

For `allow` and `log_only`, Enforra writes `decision_logged` before calling `execute`.

If that audit write fails:

```ts
if (!result.ok && !result.executed && result.auditFailed) {
  console.error(result.error);
}
```

Behavior:

- callback is not executed
- result includes `auditFailed: true`
- result includes the audit error

## Audit Failure After Execution

If the callback succeeds but the final audit write fails:

```ts
if (!result.ok && result.executed && result.auditFailed) {
  console.log(result.data);
  console.error(result.error);
}
```

Behavior:

- callback already executed
- result includes `executed: true`
- result includes callback `data`
- result includes `auditFailed: true`
- callers should not blindly retry the side effect

## Matched Policy Metadata

All result shapes include:

- `decision`
- `matchedPolicyId` when a policy matched
- `reason`
- `executed`

Use these fields for application-level logging, user messaging, and approval routing.
