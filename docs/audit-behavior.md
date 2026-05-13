# Audit Behavior

Enforra OSS writes local JSONL audit events for policy decisions and tool-call outcomes.

## Audit Event Path

By default, audit events are written to:

```text
.enforra/audit.jsonl
```

You can override the path:

```ts
const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: "./tmp/enforra-audit.jsonl"
});
```

The audit directory is created if it does not exist.

## JSONL Format

Each line is a JSON object.

Fields:

- `id`
- `timestamp`
- `agent`
- `tool`
- `decision`
- `matchedPolicyId`
- `status`
- `argsRedacted`
- `contextRedacted`
- `durationMs`
- `error`

Example:

```json
{
  "id": "evt_...",
  "timestamp": "2026-05-13T20:00:00.000Z",
  "agent": "support-agent",
  "tool": "stripe.refund",
  "decision": "require_approval",
  "matchedPolicyId": "approve-medium-refunds",
  "status": "pending_approval",
  "argsRedacted": { "customerId": "cus_123", "amount": 250 },
  "contextRedacted": { "environment": "production" },
  "durationMs": 1
}
```

## Statuses

- `decision_logged`: policy allowed execution and the pre-execution audit event was written.
- `executed`: callback executed after an `allow` decision.
- `logged`: callback executed after a `log_only` decision.
- `blocked`: callback did not execute because policy returned `block`.
- `pending_approval`: callback did not execute because policy returned `require_approval`.
- `failed`: callback was entered and threw an error.

## Redaction

Audit logging redacts common secret fields recursively in `args` and `context`.

Examples of redacted key patterns include:

- `password`
- `token`
- `accessToken`
- `access_token`
- `refreshToken`
- `refresh_token`
- `apiKey`
- `api_key`
- `apikey`
- `secret`
- `clientSecret`
- `client_secret`
- `authorization`
- `cookie`
- `setCookie`
- `set_cookie`
- `privateKey`
- `private_key`

Redacted values are written as:

```text
[REDACTED]
```

Error messages written to audit logs are also redacted for common secret patterns, including bearer tokens, `token=...`, `api_key=...`, `apikey=...`, `authorization=...`, `password=...`, `secret=...`, and `sk_` style keys.

The original `Error` object is preserved in the SDK result returned to the caller. Redaction applies to audit output only.

## Pre-Execution Audit Behavior

For `allow` and `log_only`, Enforra writes a `decision_logged` event before calling `execute`.

If that pre-execution audit write fails, the callback is not executed and the SDK returns `auditFailed: true`.

This creates local evidence that policy allowed execution before the side effect occurred.

## Audit Failure Behavior

For `block` and `require_approval`:

- the callback is not executed
- if audit logging fails, the result includes `auditFailed: true`

For `allow` and `log_only` before execution:

- if `decision_logged` fails, the callback is not executed
- the result includes `auditFailed: true`

For `allow` and `log_only` after successful execution:

- if the final audit write fails, the callback has already executed
- the result includes `executed: true`
- the result includes callback `data`
- the result includes `auditFailed: true`

For execution failure:

- the original execution error is returned to the caller
- Enforra attempts to write a `failed` audit event
- if that audit write also fails, the original execution error is still preserved and the result includes `auditFailed: true`

## Current Limitation

Local audit logs are redacted but not tamper-evident yet.

The current OSS runtime does not implement:

- hash chaining
- HMAC signatures
- append-only storage guarantees
- hosted retention
- log shipping

Optional tamper-evident local audit mode is tracked as a possible future improvement in the roadmap.
