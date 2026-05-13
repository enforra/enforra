# Scope

Enforra OSS focuses on application-level tool-call enforcement.

It is intentionally simple: a local policy boundary around tools your agents already call.

## In scope

- local YAML policy evaluation,
- deterministic decisions (`allow`, `block`, `require_approval`, `log_only`),
- local enforcement around `execute` callbacks,
- local audit evidence with redaction.

## Out of scope

Enforra OSS core is not:

- an MCP proxy,
- a model firewall,
- a kernel sandbox,
- a prompt-injection detector.

It does not provide hosted workflow systems.

Policy management UX, team workflows, hosted audit retention, and approvals orchestration are outside this OSS core.
