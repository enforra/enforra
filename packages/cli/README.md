# Enforra CLI

The Enforra CLI helps developers try the OSS SDK quickly from a local project. It can create starter policy files, run policy tests, verify local hash-chain audit logs, and check basic local setup.

No telemetry, network calls, hosted API, dashboard, auth, billing, or cloud features are included.

## Install

Later, install it in your project:

```bash
npm install -D @enforra/cli
```

From this monorepo, run the CLI package with pnpm filters or after building the workspace package.

## Commands

```bash
enforra init
enforra test
enforra audit verify
enforra doctor
```

`enforra init` creates:

```text
policies/enforra.yaml
policies/enforra.cases.yaml
```

`enforra test` defaults to those files, and also supports:

```bash
enforra test --policy policies/starter/support-agent.yaml --cases examples/quickstart/support-refund-node/policy-cases.yaml
enforra test --trace
```

`enforra audit verify` defaults to:

```text
.enforra/audit.jsonl
```
