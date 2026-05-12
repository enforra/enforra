# Enforra

[![CI](https://github.com/enforra/enforra/actions/workflows/ci.yml/badge.svg)](https://github.com/enforra/enforra/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

AI agents can now call tools, access data, and create real side effects. System prompts are not a reliable security boundary. Enforra adds a local policy boundary before tool calls execute.

```ts
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policies/starter/support-agent.yaml",
  auditPath: ".enforra/audit.jsonl"
});

const result = await enforra.enforceToolCall({
  agent: "support-agent",
  tool: "stripe.refund",
  args: {
    customerId: "cus_123",
    amount: 250
  },
  context: {
    environment: "production"
  },
  execute: async () => {
    return { refundId: "ref_123", status: "created" };
  }
});

// execute only runs when policy returns allow or log_only.
console.log(result.decision);
// "require_approval"
```

## What is Enforra?

This open source repository contains the local runtime core for Enforra. It evaluates policy before a tool callback runs and returns one of four decisions: `allow`, `block`, `require_approval`, or `log_only`.

The customer application owns actual tool execution. The Enforra runtime does not execute tools remotely, does not require your secrets, and does not call a hosted API.

## Why runtime control?

Agent instructions are useful, but they are not a security boundary. Runtime control gives developers a typed enforcement point immediately before side effects happen.

## Prerequisites

- Node.js 20 or newer
- pnpm via Corepack

## Quickstart

```bash
git clone https://github.com/enforra/enforra.git
cd enforra
corepack enable
pnpm install
pnpm build
pnpm test
pnpm demo:support-refund
```

## Develop from source

This repository is a pnpm monorepo. Packages are currently developed from source:

```bash
pnpm install
```

## Run the demo

```bash
pnpm demo:support-refund
```

The demo runs three fake refund calls: a small allowed refund, a medium refund requiring approval, and a large blocked refund.

```text
Enforra support refund demo

Tool call: stripe.refund
Agent: support-agent
Amount: 20
Decision: allow
Executed: yes

Tool call: stripe.refund
Agent: support-agent
Amount: 250
Decision: require_approval
Executed: no
Reason: matched policy approve-medium-refunds

Tool call: stripe.refund
Agent: support-agent
Amount: 1000
Decision: block
Executed: no
Reason: matched policy block-large-refunds

Audit log written to .enforra/audit.jsonl
```

## Basic usage

Call `enforceToolCall` with `agent`, `tool`, `args`, optional `context`, and an `execute` callback. Enforra only calls `execute` when the decision is `allow` or `log_only`.

## Policy example

Starter YAML policies live in `policies/starter` as examples. They are not required runtime configuration. In a real application, pass `createEnforraClient` the path to your own YAML policy file. The SDK is not hardcoded to the starter policies.

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

This open source runtime loads policies from local YAML files so developers can inspect and run the enforcement logic without a hosted service.

The runtime performs no network calls, telemetry, analytics, database writes, or hidden background work. The customer application owns actual tool execution. Enforra only decides whether the local `execute` callback should run.

This repository is focused on local runtime enforcement. Policy management, team workflows, and hosted audit retention are outside the scope of this OSS core.

## What this repository does not include

This repository contains the local runtime core only.

It does not include a hosted API, cloud dashboard, hosted audit retention, team approvals, auth, billing, RBAC, SSO, Slack or email approvals, compliance reports, remote tool execution, or MCP gateway behavior.

## Project structure

```text
packages/policy-core       Policy loading, validation, and evaluation
packages/sdk-node          Node SDK enforcement wrapper
packages/local-audit       Local JSONL audit logging and redaction
examples/support-refund-agent
policies/starter
docs
packages/*/test
```

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.
