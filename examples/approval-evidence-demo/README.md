# Approval Evidence Demo

This example shows Enforra's intended middle lane:

- policy evaluation before action
- approval boundary without hosted approval workflow
- local audit evidence
- application-owned tool callbacks

No external API calls are made. Every callback returns local mock data.

## Policy Used

```text
policies/starter/approval-evidence.yaml
```

## Run

```bash
pnpm demo:approval-evidence
```

## Expected Decisions

- `email.send` to `teammate@example.com` returns `allow` and executes.
- `email.send` to `external@example.com` returns `require_approval` and does not execute.
- `customer.export` in production returns `block` and does not execute.
- `github.create_issue` returns `log_only` and executes.

The approval-required call prints evidence like:

```json
{
  "decision": "require_approval",
  "executed": false,
  "reason": "matched policy approve-external-email",
  "status": "pending_approval"
}
```

## Audit Logs

Audit logs are written to:

```text
.enforra/audit.jsonl
```

Allowed and `log_only` calls write a pre-execution `decision_logged` event before the callback runs, then a final `executed` or `logged` event.

Blocked and approval-required calls do not execute their callbacks. They write `blocked` or `pending_approval`.
