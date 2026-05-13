# Enforra

[![CI](https://github.com/enforra/enforra/actions/workflows/ci.yml/badge.svg)](https://github.com/enforra/enforra/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Enforra is a local runtime policy boundary for AI agent tool calls. It evaluates policy before tool callbacks execute.

## Architecture at a glance

```text
Agent proposes tool call
↓
Enforra evaluates policy
↓
allow | block | require_approval | log_only
↓
execute callback only when allowed
↓
write local audit log
```

See [docs/architecture.md](docs/architecture.md) and [docs/scope.md](docs/scope.md).

## Why this exists

System prompts are not a security boundary. Enforra gives developers an application-level enforcement point directly before side effects.

- `allow` and `log_only`: write pre-execution audit, then execute callback.
- `block` and `require_approval`: do not execute callback (fail closed).
- audit logs are local JSONL with redaction for common secret fields.

The customer application owns real tool callbacks. Enforra does not execute tools remotely and does not call a hosted API.

## Quickstart

```bash
corepack enable
pnpm install
pnpm build
pnpm test
pnpm demo:support-refund
```

## Examples

- `support-refund-agent`: shows `allow`, `require_approval`, and `block` for a fake refund tool.
- `openai-style-tool-wrapper`: shows how to wrap model-proposed tool calls without calling an external API.
- `mcp-style-tool-policy`: shows policy checks for MCP-like tools without proxying MCP transport.

Run demos:

```bash
pnpm demo:support-refund
pnpm demo:openai-style
pnpm demo:mcp-style
# or run all
pnpm demo:all
```

## What this repo includes

- local YAML policy loading and evaluation,
- SDK wrapper around tool callback execution,
- local audit logging with redaction,
- starter policy examples and runnable demos.

## What this repo does not include

No cloud dashboard, hosted API, auth, billing, RBAC, SSO, Slack/email approvals, database, telemetry, analytics, or remote tool execution.

## Docs

- [docs/quickstart.md](docs/quickstart.md)
- [docs/concepts.md](docs/concepts.md)
- [docs/policy-language.md](docs/policy-language.md)
- [docs/security-model.md](docs/security-model.md)
- [docs/limitations.md](docs/limitations.md)
- [docs/roadmap.md](docs/roadmap.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
