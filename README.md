# Enforra

[![CI](https://github.com/enforra/enforra/actions/workflows/ci.yml/badge.svg)](https://github.com/enforra/enforra/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

System prompts are not a security boundary. When an AI agent can issue refunds, run commands, send emails, or export data, the control point needs to sit before the tool action executes.

Enforra Core is a local policy and audit layer for AI agent tool calls. It evaluates YAML policy before the application-owned callback runs and returns allow, block, require_approval, or log_only.

The OSS core runs locally, makes no network calls, and does not execute your tools remotely.

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

Packages are currently developed from source in this monorepo. npm publishing is not live yet.

## What is Enforra?

This open source repository contains the local runtime core for Enforra. It evaluates policy before a tool callback runs and returns one of four decisions: `allow`, `block`, `require_approval`, or `log_only`.

Enforra is designed for teams that need control over agent actions, not just agent outputs. It lets developers define which tool calls are allowed, blocked, logged, or marked as requiring approval before the application callback runs.

The customer application owns actual tool execution. The Enforra runtime does not execute tools remotely, does not require your secrets, and does not call a hosted API.

## Why runtime control?

Agent instructions are useful, but they are not a security boundary. Runtime control gives developers a typed enforcement point immediately before side effects happen.

## Why not just use a system prompt?

System prompts can guide behavior, but enforcement should happen at the point where an agent action becomes a real side effect.

Enforra evaluates policy immediately before the tool callback runs, so manipulated or unexpected agent behavior can still be blocked, paused for approval, or logged before side effects happen.

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
pnpm policy:test:all
pnpm demo:all
pnpm benchmark:all
```

## Develop from source

This repository is a pnpm monorepo. Packages are currently developed from source:

```bash
pnpm install
```

## Run the demos

```bash
pnpm demo:support-refund
pnpm demo:openai-style
pnpm demo:mcp-style
pnpm demo:approval-evidence
pnpm demo:audit-integrity
pnpm demo:all
```

The support refund demo runs three fake refund calls: a small allowed refund, a medium refund requiring approval, and a large blocked refund.

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

## Examples

- `examples/support-refund-agent`: runnable local demo for allow, require approval, and block decisions.
- `examples/openai-style-tool-wrapper`: wrapper pattern for calling `enforceToolCall` before an application tool callback.
- `examples/mcp-style-tool-policy`: starter policy pattern for MCP-style tool names at the application boundary; this repository does not implement an MCP gateway.
- `examples/approval-evidence-demo`: local evidence demo for allow, require approval, block, and log-only decisions.
- `examples/audit-integrity-demo`: optional hash-chain audit integrity demo for local audit logs.

## Basic usage

Call `enforceToolCall` with `agent`, `tool`, `args`, optional `context`, and an `execute` callback. Enforra only calls `execute` when the decision is `allow` or `log_only`.

## Test policies before runtime

Policy tests simulate tool-call inputs against local YAML policy files without executing callbacks.

```bash
pnpm policy:test:all
```

Use policy tests in local development and CI to catch policy regressions before agent tool calls create side effects.

## Decision trace

Enforra can explain why a policy decision happened. This helps developers debug policies before runtime and produce clearer evidence for blocked or approval-required actions.

See [docs/decision-trace.md](docs/decision-trace.md).

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
    conditions:
      - field: args.amount
        operator: lte
        value: 50
    decision: allow
```

## Coding-agent policy example

```yaml
version: 1
defaults:
  decision: block
policies:
  - id: block-env-file-access
    match:
      tool: filesystem.read
    conditions:
      - field: args.path
        operator: contains
        value: ".env"
    decision: block

  - id: approve-package-install
    match:
      tool: terminal.run
    conditions:
      - field: args.command
        operator: contains
        value: "npm install"
    decision: require_approval
```

Conditions use dot paths rooted at `args` or `context`, such as `args.amount`, `args.recipient`, or `context.environment`. Supported operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, and `not_contains`. Conditions can be written as a flat array where every condition must pass, or grouped with `all` and `any`. Policies can optionally set `priority`; lower numbers evaluate first.

## The four decisions

- `allow`: write a pre-execution decision audit event, execute the callback, and log `executed`.
- `block`: do not execute the callback and log `blocked`.
- `require_approval`: do not execute in the open source local runtime and log `pending_approval`.
- `log_only`: write a pre-execution decision audit event, execute the callback, and log `logged`.

## What gets logged

Audit events are appended to `.enforra/audit.jsonl`. Arguments and context are recursively redacted for common secret fields before they are written. For `allow` and `log_only`, the runtime writes a decision audit event before calling `execute`; if that audit write fails, the callback is not run. Successful executed tool calls can create more than one audit event: a pre-execution `decision_logged` event and a final `executed` or `logged` event.

Optional hash-chain mode can add tamper-evident integrity metadata to local audit logs. It helps detect modified, deleted, or reordered events when verified later, but it is not tamper-proof.

## Security model

This open source runtime loads policies from local YAML files so developers can inspect and run the enforcement logic without a hosted service. Policy decisions are deterministic for the same policy and tool-call input.

The runtime performs no network calls, telemetry, analytics, database writes, or hidden background work. The customer application owns actual tool execution. Enforra only decides whether the local `execute` callback should run.

This repository is focused on local runtime enforcement. Policy management, team workflows, and hosted audit retention are outside the scope of this OSS core.

## Scope

Enforra focuses on application-level action governance. It is not an MCP proxy, model firewall, kernel sandbox, or prompt-injection detector. It gives developers a local policy boundary around the tools their agents already call.

## What this repository does not include

This repository contains the local runtime core only.

It does not include a hosted API, cloud dashboard, hosted audit retention, team approvals, auth, billing, RBAC, SSO, Slack or email approvals, compliance reports, remote tool execution, or MCP gateway behavior.

## What is included

This repository includes:

- policy loading, validation, and evaluation
- Node SDK wrapper for agent tool calls
- local JSONL audit logging with redaction
- optional hash-chain integrity for local audit logs
- starter policy examples
- runnable support, OpenAI-style, and MCP-style demos
- tests for policy evaluation, audit redaction, and SDK behavior
- CI for build, test, and lint

## Project structure

```text
packages/policy-core       Policy loading, validation, and evaluation
packages/policy-simulator  Local policy simulation and case runner
packages/sdk-node          Node SDK enforcement wrapper
packages/local-audit       Local JSONL audit logging and redaction
examples/support-refund-agent
examples/openai-style-tool-wrapper
examples/mcp-style-tool-policy
examples/approval-evidence-demo
examples/audit-integrity-demo
examples/benchmark-policy-eval
policies/starter
docs
packages/*/test
```

## Docs

- [Architecture](docs/architecture.md)
- [Scope](docs/scope.md)
- [Threat model](docs/threat-model.md)
- [SDK reference](docs/sdk-reference.md)
- [Framework integration patterns](docs/integrations.md)
- [Audit behavior](docs/audit-behavior.md)
- [Audit integrity](docs/audit-integrity.md)
- [Write your first policy](docs/write-your-first-policy.md)
- [Policy testing](docs/policy-testing.md)
- [Decision trace](docs/decision-trace.md)
- [Benchmarks](docs/benchmarks.md)
- [Policy language](docs/policy-language.md)
- [Security model](docs/security-model.md)
- [Limitations](docs/limitations.md)

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.
