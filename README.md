AI agents can now call tools, access data, and create real side effects.
System prompts are not a reliable security boundary.
Enforra adds a local policy boundary before tool calls execute.

# Enforra

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

const result = await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: { customerId: "cus_123", amount: 250 },
  context: { environment: "production" },
  execute: async () => fakeRefund()
});
```

## What is Enforra?

Enforra is a local-first runtime control layer for AI agent tool calls. It evaluates policy before a tool callback runs and returns one of four decisions: `allow`, `block`, `require_approval`, or `log_only`.

The customer application owns actual tool execution. Enforra does not execute tools remotely, does not need your secrets, and does not call a hosted API.

## Why runtime control?

Agent instructions are useful, but they are not a security boundary. Runtime control gives developers a typed enforcement point immediately before side effects happen.

## Quickstart

```bash
pnpm install
pnpm build
pnpm test
pnpm demo:support-refund
```

## Install

This repository is a pnpm monorepo. Packages are currently developed from source:

```bash
pnpm install
```

## Run the demo

```bash
pnpm demo:support-refund
```

The demo runs three fake refund calls: a small allowed refund, a medium refund requiring approval, and a large blocked refund.

## Basic usage

Call `enforceToolCall` with `agent`, `tool`, `args`, optional `context`, and an `execute` callback. Enforra only calls `execute` when the decision is `allow` or `log_only`.

## Policy example

```yaml
version: 1
defaults:
  decision: block
policies:
  - id: allow-small-refunds
    match:
      agent: support-agent
      tool: stripe.refund
      args:
        amount_lte: 50
    decision: allow
```

## The four decisions

- `allow`: execute the callback and log `executed`.
- `block`: do not execute the callback and log `blocked`.
- `require_approval`: do not execute in the open source local runtime and log `pending_approval`.
- `log_only`: execute the callback and log `logged`.

## What gets logged

Audit events are appended to `.enforra/audit.jsonl`. Arguments and context are recursively redacted for common secret fields before they are written.

## Security model

Enforra is local-first and deterministic. Policies are loaded from local YAML files. The open source core is inspectable and performs no network calls, telemetry, analytics, database writes, or hidden background work.

## What Enforra does not do

This open source core does not include a cloud dashboard, hosted audit retention, team approvals, auth, billing, RBAC, SSO, Slack or email approvals, compliance reports, a hosted API, Supabase, Postgres, Redis, remote tool execution, or MCP gateway behavior.

The cloud product may later add hosted audit logs, team approvals, policy management, RBAC, SSO, and compliance reporting.

## Project structure

```text
packages/policy-core       Policy loading, validation, and evaluation
packages/sdk-node          Node SDK enforcement wrapper
packages/local-audit       Local JSONL audit logging and redaction
examples/support-refund-agent
policies/starter
docs
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.
