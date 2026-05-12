# Contributing

## Local setup

Use Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Development

Packages live under `packages/*`. Examples live under `examples/*`. Starter policies live under `policies/starter`.

Keep changes local-first. Do not add network calls, telemetry, cloud dependencies, databases, queues, web servers, or hidden background processes to the open source runtime core.

## Policy templates

Add policy templates as YAML files under `policies/starter`. Keep them generic, readable, and safe by default. Use `defaults.decision: block` unless there is a clear reason not to.

## Tests

Security-sensitive changes need tests. Policy evaluation changes should include policy-core unit tests. SDK behavior changes should include sdk-node tests. Audit and redaction changes should include local-audit tests.
