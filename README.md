# Enforra

[![CI](https://github.com/enforra/enforra/actions/workflows/ci.yml/badge.svg)](https://github.com/enforra/enforra/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

System prompts are not a security boundary. When an AI agent can issue refunds, run commands, send emails, or export data, the control point should sit before the tool action executes.

**Enforra is local-first runtime policy enforcement before AI agent tool execution.** It is a lightweight SDK that evaluates local policies before application-owned tool callbacks run, returning one of four decisions: `allow`, `block`, `require_approval`, or `log_only`.

The open-source runtime in this repository runs locally by default. It makes policy decisions before application-owned tool callbacks execute, does not require Enforra Cloud, and does not send hosted telemetry by default.

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

## OSS runtime and Enforra Cloud

This repository contains the open-source local runtime core for Enforra.

The OSS runtime is designed to work without a hosted service. It loads local policies, evaluates tool calls before execution, and writes local audit logs.

Enforra Cloud is separate and optional. It is intended for team workflows such as hosted dashboards, centralized audit retention, approval workflows, rollout controls, analytics, and organization-level management.

## Install

### Node.js SDK

```bash
npm install @enforra/sdk-node
```

### MCP (Model Context Protocol) Integration

```bash
npm install @enforra/mcp
```

### Python SDK

```bash
pip install enforra
```

_(For local SDK development / contributors)_:

```bash
cd packages/sdk-python
python3 -m pip install -e ".[dev]"
```

## What you can do today

- **Enforce Agent Tool Calls**: Intercept and authorize tool calls with `allow`, `block`, `require_approval`, or `log_only` decisions based on local YAML policies.
- **Run in Observe Mode**: Shadow policy decisions (evaluating policies and logging results) without blocking tool callbacks or requiring approval.
- **Wrap MCP-Style Tool Handlers**: Guard local Model Context Protocol tool execution paths easily using `@enforra/mcp`.
- **Integrate in Node.js Applications**: Use the library directly in Node.js via `@enforra/sdk-node`.
- **Integrate in Python Applications**: Use the library directly in Python via `pip install enforra`.
- **Log Local JSONL Audit Evidence**: Automatically generate local, structured audit trails (with optional hash-chain integrity verification) to document agent decisions without cloud telemetry.

## Integrations

Enforra includes runnable integration examples and framework-style tool wrapper patterns. Some examples use real framework packages. Others intentionally avoid heavy dependencies and show where Enforra sits before tool execution:

- **LangGraph** (Python): [Real Package Integration](docs/integrations/langgraph.md) using `langgraph` and `langchain-core`
- **OpenAI Agents SDK** (Python): [Real Package Integration](docs/integrations/openai-agents.md) using `openai-agents`
- **Vercel AI SDK** (Node.js): [Real Package Integration](docs/integrations/vercel-ai-sdk.md) using `ai` and `zod`
- **MCP-Style Tool Handlers** (Node.js): [Real Package Integration](docs/mcp.md) using `@enforra/mcp`
- **CrewAI** (Python): [CrewAI-style Tool Wrapper Pattern](docs/integrations/crewai.md) (avoids heavy ML dependencies)
- **AutoGen** (Python): [AutoGen-style Tool Wrapper Pattern](docs/integrations/autogen.md) (avoids heavy ML dependencies)

These are integration examples and patterns, not hosted proxies or certified framework partnerships. See [docs/integrations.md](docs/integrations.md) for the full index.

## What this OSS runtime is not

- **Not a hosted proxy by itself**: Enforra does not sit between your agent and external APIs as a proxy server.
- **Not a full MCP gateway**: It is not a gateway, authentication layer, or transport manager for MCP client-server communication.
- **Not an identity provider**: Enforra does not handle user authentication, OAuth, SSO, or enterprise RBAC.
- **Not the hosted Enforra Cloud dashboard**: The OSS runtime is not the hosted Enforra Cloud product. Cloud dashboards, centralized audit retention, approvals, rollout controls, and organization management belong in Enforra Cloud, not this local runtime package.

## What is Enforra?

This open source repository contains the local runtime core for Enforra. It evaluates policy before a tool callback runs and returns one of four decisions: `allow`, `block`, `require_approval`, or `log_only`.

Enforra is designed for teams that need control over agent actions, not just agent outputs. It lets developers define which tool calls are allowed, blocked, logged, or marked as requiring approval before the application callback runs.

The customer application owns actual tool execution. The Enforra runtime does not execute tools remotely, does not require your secrets, and does not call a hosted API.

## Why runtime control?

Agent instructions are useful, but they are not a security boundary. Runtime control gives developers a typed enforcement point immediately before side effects happen.

## Why not just use a system prompt?

System prompts can guide behavior, but enforcement should happen at the point where an agent action becomes a real side effect.

Enforra evaluates policy immediately before the tool callback runs, so manipulated or unexpected agent behavior can still be blocked, marked as requiring approval, or logged before side effects happen.

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

This repository is a pnpm monorepo. To work on packages from source:

```bash
pnpm install
```

## CLI

Use the Enforra CLI to create starter policies and run policy tests locally.

```bash
npx @enforra/cli init
npx @enforra/cli test
```

The CLI creates a starter policy and test cases so you can validate decisions before wiring Enforra into your agent tools.

## Run the demos

```bash
pnpm demo:support-refund
pnpm demo:openai-style
pnpm demo:mcp-style
pnpm demo:approval-evidence
pnpm demo:audit-integrity
pnpm demo:mcp-guard
pnpm demo:db-unsafe
pnpm demo:db-enforra
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
- `examples/python-support-refund-agent`: runnable local Python demo for enforce mode and observe mode.
- `examples/openai-style-tool-wrapper`: wrapper pattern for calling `enforceToolCall` before an application tool callback.
- `examples/mcp-style-tool-policy`: starter policy pattern for MCP-style tool names at the application boundary; this repository does not implement an MCP gateway.
- `examples/mcp-tool-guard-demo`: runnable local demo of Enforra MCP tool handler guarding.
- `examples/approval-evidence-demo`: local evidence demo for allow, require approval, block, and log-only decisions.
- `examples/audit-integrity-demo`: optional hash-chain audit integrity demo for local audit logs.
- `examples/db-delete-video-demo`: simple video demo contrasting a direct table-delete callback with the same callback protected by Enforra.

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

## Observe Mode

Observe mode allows you to shadow policy decisions without blocking tool callbacks or requiring approval. This is useful for testing new policies in production or auditing tool execution patterns.

To enable observe mode, specify `mode: observe` or `observe_only: true` at the root of your policy YAML file:

```yaml
version: 1
mode: observe
defaults:
  decision: block
policies:
  - id: block-large-refunds
    match:
      tool: stripe.refund
    conditions:
      - field: args.amount
        operator: gt
        value: 500
    decision: block
```

### Behavior in Observe Mode

- **Execution**: The runtime never blocks execution. Callbacks run even if policies match `block` or `require_approval`.
- **Audit Logs**: The logged event includes observe mode details:
  - `enforcement_mode: "observe"`
  - `observed_decision`: the decision dictated by the matching policy (e.g., `block`).
  - `effective_decision`: the actual enforcement outcome (e.g., `allow`).
  - `shadow: true` and `observe_mode: true` flags.

## What gets logged

Audit events are appended to `.enforra/audit.jsonl`. Arguments and context are recursively redacted for common secret fields before they are written. For `allow` and `log_only`, the runtime writes a decision audit event before calling `execute`; if that audit write fails, the callback is not run. Successful executed tool calls can create more than one audit event: a pre-execution `decision_logged` event and a final `executed` or `logged` event.

Optional hash-chain mode can add tamper-evident integrity metadata to local audit logs. It helps detect modified, deleted, or reordered events when verified later, but it is not tamper-proof.

## Security model

This open source runtime loads policies from local YAML files so developers can inspect and run the enforcement logic without a hosted service. Policy decisions are deterministic for the same policy and tool-call input.

The runtime performs no network calls, telemetry, analytics, database writes, or hidden background work. The customer application owns actual tool execution. Enforra only decides whether the local `execute` callback should run.

This repository is focused on the open-source local runtime. Policy management, team workflows, hosted audit retention, cloud dashboards, and organization-level controls belong in the optional Enforra Cloud product.

## Scope

Enforra focuses on application-level action governance. It is not an MCP proxy, model firewall, kernel sandbox, or prompt-injection detector. It gives developers a local policy boundary around the tools their agents already call.

## What this repository does not include

This repository contains the open-source local runtime core. It does not include the hosted Enforra Cloud application, cloud dashboard, hosted audit retention, team approval workflows, billing, SSO, or organization management.

## What is included

This repository includes:

- policy loading, validation, and evaluation
- Node SDK wrapper for agent tool calls
- local JSONL audit logging with redaction
- optional hash-chain integrity for local audit logs
- starter policy examples
- runnable support, OpenAI-style, MCP-style, MCP tool guard, approval evidence, audit integrity, database guard, and benchmark demos
- tests for policy evaluation, audit redaction, and SDK behavior
- CI for build, test, and lint

## Project structure

```text
packages/policy-core       Policy loading, validation, and evaluation
packages/policy-simulator  Local policy simulation and case runner
packages/sdk-node          Node SDK enforcement wrapper
packages/cli               CLI for init, policy tests, audit verification, and setup checks
packages/local-audit       Local JSONL audit logging and redaction
packages/mcp               MCP-style tool handler guard
examples/support-refund-agent
examples/openai-style-tool-wrapper
examples/mcp-style-tool-policy
examples/mcp-tool-guard-demo
examples/approval-evidence-demo
examples/audit-integrity-demo
examples/db-delete-video-demo
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
- [MCP Integration](docs/mcp.md)
- [Security model](docs/security-model.md)
- [Limitations](docs/limitations.md)

## Feedback and Community

We are actively looking for feedback from developers building production AI agents, MCP servers, and agentic workflows.

- Found a bug? Open a GitHub issue.
- Have a feature request or integration idea? Open a GitHub issue.
- Want to talk directly with the team or explore becoming a design partner? Join our Slack or Discord community.
- Security-sensitive feedback? Email security@enforra.com.

Slack: https://join.slack.com/t/enforra/shared_invite/zt-3xs2z71z5-9Cf_dqTbYRe3Z1WBiFvRRA  
Discord: https://discord.gg/PkXtk9C3q

## Roadmap

See [docs/roadmap.md](docs/roadmap.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0.
