# Audit Integrity Demo

This example enables optional hash-chain integrity for local audit logs and verifies the log after several local tool calls.

No external API calls are made. The tool callbacks return local mock results.

## Policy Used

```text
policies/starter/support-agent.yaml
```

## Run

```bash
pnpm demo:audit-integrity
```

## Expected Output

```text
Enforra audit integrity demo

Audit verification: valid
Events checked: 4
Audit log written to .enforra/audit.jsonl
```

The exact event count changes if the demo calls change. Allowed calls write both `decision_logged` and a final outcome event.

## What It Shows

- `auditIntegrity: "hash_chain"` adds local SHA-256 chain metadata to each audit event.
- `verifyAuditLog` checks the chain later.
- The mode is tamper-evident, not tamper-proof.
- A local attacker with filesystem access can rewrite the whole file.

## Audit Logs

Audit logs are written to:

```text
.enforra/audit.jsonl
```
