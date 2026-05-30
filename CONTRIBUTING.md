# Contributing

## Local setup

Use Node.js 20 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Run the demos

Demos are local-only and use mock callbacks. They should make no external API calls.

```bash
pnpm demo:all
pnpm demo:audit-integrity
```

## Run policy tests and benchmarks

```bash
pnpm policy:test:all
pnpm benchmark:all
```

## Code style

Format with Prettier and keep lint clean:

```bash
pnpm format
pnpm lint
```

## Opening PRs

- Keep PRs small and focused.
- Include tests for security-sensitive behavior changes.
- Update docs when behavior or assumptions change.

## Security-sensitive changes

Security-sensitive changes need tests. Policy evaluation changes should include policy-core unit tests. SDK behavior changes should include sdk-node tests. Audit and redaction changes should include local-audit tests.

If a change impacts threat assumptions or trust boundaries, update `docs/threat-model.md`.

## No secrets in issues or PRs

Do not include API keys, tokens, credentials, customer data, or private audit logs in issues, PR descriptions, commit messages, screenshots, or attached files.

## Development

Packages live under `packages/*`. Examples live under `examples/*`. Starter policies live under `policies/starter`.

Keep changes local-first. Do not add network calls, telemetry, cloud dependencies, databases, queues, web servers, or hidden background processes to the open source runtime core.

## Policy templates

Add policy templates as YAML files under `policies/starter`. Keep them generic, readable, and safe by default. Use `defaults.decision: block` unless there is a clear reason not to.

## Tests

See "Security-sensitive changes" above for test expectations.

## Quality gates

Before opening a PR, review:

- [AGENTS.md](AGENTS.md)
- [docs/quality-gates.md](docs/quality-gates.md)
- [.github/pull_request_template.md](.github/pull_request_template.md)

Do not duplicate the whole content.
