# Policy Language

Version `1` supports exact match on `agent` and `tool`, plus conditions over `args.*` and `context.*`.

Supported decisions:

- `allow`
- `block`
- `require_approval`
- `log_only`

Supported operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`.

Evaluation:

1. Top-to-bottom policy evaluation.
2. First match wins.
3. Fallback to `defaults.decision`.
4. If no default exists, decision is `block`.

Starter policies:

- `policies/starter/support-agent.yaml`
- `policies/starter/openai-style-agent.yaml`
- `policies/starter/mcp-style-tools.yaml`
