# Support Refund Agent Example

This example shows local enforcement for a fake support agent that can request refunds.

No external API calls are made. The refund callback returns a local fake result.

## Policy Used

```text
policies/starter/support-agent.yaml
```

The policy:

- allows small refunds
- marks medium refunds as requiring approval
- blocks large refunds

## Run

```bash
pnpm demo:support-refund
```

## Expected Output

```text
Enforra support refund demo

Tool call: stripe.refund
Agent: support-agent
Amount: 20
Decision: allow
Executed: yes

Tool call: stripe.refund
Agent: support-agent
Amount: 250
Decision: require_approval
Executed: no
Reason: matched policy approve-medium-refunds

Tool call: stripe.refund
Agent: support-agent
Amount: 1000
Decision: block
Executed: no
Reason: matched policy block-large-refunds

Audit log written to .enforra/audit.jsonl
```

## Why Each Decision Happens

- `amount: 20` matches `allow-small-refunds`, so the fake refund callback executes.
- `amount: 250` matches `approve-medium-refunds`, so the callback does not execute.
- `amount: 1000` matches `block-large-refunds`, so the callback does not execute.

## Audit Logs

Audit logs are written to:

```text
.enforra/audit.jsonl
```

For `allow`, the runtime writes a pre-execution `decision_logged` event and a final `executed` event.

For `require_approval`, the runtime writes `pending_approval`.

For `block`, the runtime writes `blocked`.
