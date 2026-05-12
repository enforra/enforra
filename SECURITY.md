# Security Policy

## Reporting vulnerabilities

Do not open public issues for security vulnerabilities.

Report suspected vulnerabilities to security@enforra.com. Include a description, reproduction steps, affected versions or commits, and any relevant logs with secrets removed.

## Security model

Enforra open source core is local-first:

- Policy evaluation runs locally.
- Tool execution stays inside the customer application.
- Enforra does not execute tools remotely.
- Enforra does not require secrets.
- Audit logs redact common secret fields before writing JSONL events.
- Policy evaluation is deterministic: the first matching policy wins.

## Known limitations

The local runtime does not provide hosted approvals, identity, RBAC, SSO, distributed audit retention, compliance reporting, or MCP gateway enforcement. `require_approval` is represented as a local decision and does not execute the tool callback.
