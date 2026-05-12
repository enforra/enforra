# Security Model

This open source runtime is local-first. Policies are provided as local YAML files in this repository so developers can inspect and run the enforcement logic without a hosted service. Policy decisions are deterministic for the same policy and tool-call input.

The runtime performs no network calls, telemetry, analytics, database writes, or hidden background work. The customer application owns actual tool execution. Enforra only decides whether the local `execute` callback should run.

- No hosted API is required.
- No secrets are required by Enforra.
- No remote tool execution is implemented.
- `allow` and `log_only` run the local `execute` callback.
- `block` and `require_approval` do not run the local `execute` callback.
- A decision audit event is written before `allow` and `log_only` callbacks run.
- If the pre-execution audit write fails, the local `execute` callback does not run.
- Audit logs are written locally.
- Common secret fields are recursively redacted before audit events are written.
