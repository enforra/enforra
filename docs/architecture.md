# Architecture

Enforra OSS is a local runtime core for governing AI agent tool calls.

The customer application owns the agent, the tools, and the actual execution callback. Enforra evaluates local policy before that callback runs and returns a typed result.

## Packages

- `@enforra/policy-core`: loads, validates, and evaluates YAML policy files.
- `@enforra/sdk-node`: wraps tool calls with policy evaluation and audit logging.
- `@enforra/local-audit`: writes redacted local JSONL audit events.

## Execution Flow

1. The application creates a client with a policy file path.
2. The application calls `enforceToolCall` with `agent`, `tool`, `args`, optional `context`, and `execute`.
3. The policy engine returns `allow`, `block`, `require_approval`, or `log_only`.
4. The SDK only calls `execute` for `allow` and `log_only`.
5. Audit events are written locally with redacted args, context, and error messages.

## Boundaries

The OSS runtime performs no network calls, remote tool execution, telemetry, analytics, database writes, or hidden background work.
