# Support agent safety

Support agents should not issue out-of-policy refunds or destructive customer changes without runtime checks.

## Problem

A support agent may call payment or CRM tools to issue refunds, update records, or send email. A single wrong `args.amount` or production delete can create real customer impact. Policy should evaluate before the Stripe or CRM callback runs.

## What Enforra checks

- `agent` (`support-agent`)
- `tool` (`stripe.refund`, `account.delete`, and tools you define)
- `args.amount`, `args.customerId`, `args.recipient`
- `context.environment`

## Policy behavior

Runnable demo exercises `stripe.refund` only:

| Refund amount (USD) | Decision           | Callback runs |
| ------------------- | ------------------ | ------------- |
| 20                  | `allow`            | yes           |
| 250                 | `require_approval` | no            |
| 1000                | `block`            | no            |

## Run the example

```bash
pnpm demo:support-refund
```

Policy test without executing callbacks:

```bash
pnpm policy:test:support-refund
```

Python SDK equivalent: `python3 examples/quickstart/support-refund-python/example.py`

**Demo policy:** [policies/starter/support-agent.yaml](../../policies/starter/support-agent.yaml)

**Policy pack:** [policy-packs/support-agent-controls.yaml](../../policy-packs/support-agent-controls.yaml) — not loaded by the commands above. It is provided as a reusable starter policy for this use case.

## Expected result

```text
Amount: 20
Decision: allow
Executed: yes

Amount: 250
Decision: require_approval
Executed: no
Reason: matched policy approve-medium-refunds

Amount: 1000
Decision: block
Executed: no
Reason: matched policy block-large-refunds

Audit log written to .enforra/audit.jsonl
```

## Audit record

```text
.enforra/audit.jsonl
```

(at repository root when run via `pnpm demo:support-refund`)

Events include `decision`, `matchedPolicyId`, `status` (for example `pending_approval` on require_approval), and redacted arguments. See [audit behavior](../audit-behavior.md).

## What this proves

Refund tool calls are evaluated before the fake Stripe callback runs. Medium refunds stop before execution; large refunds are blocked. Your application owns the refund implementation; Enforra only returns the decision and writes audit evidence.

## Core model

Policy runs before tool execution. `require_approval` requires your application to implement a local approval step. Enforra Cloud approval queues and reviewer dashboards are separate optional product features, not part of this OSS runtime.
