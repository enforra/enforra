# Concepts

## Tool call

A tool call is an attempted action by an agent with `agent`, `tool`, `args`, optional `context`, and an app-owned `execute` callback.

## Policy

Policies are local YAML files. Rules are evaluated in order; first match wins.

## Enforcement boundary

Enforra evaluates policy before running `execute`.

- `allow` and `log_only`: callback can execute.
- `block` and `require_approval`: callback does not execute.

For `allow` and `log_only`, Enforra writes a pre-execution decision event first. If pre-execution audit logging fails, callback execution is prevented.

## Audit

Audit events are appended to local JSONL with redacted args/context/error fields.

See runnable examples in:

- `examples/support-refund-agent`
- `examples/openai-style-tool-wrapper`
- `examples/mcp-style-tool-policy`
