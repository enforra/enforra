# Policy Testing

Enforra includes a local policy simulator for testing policy behavior before agent tool calls run.

Policy tests are useful because policy files are executable safety configuration. A small YAML change can decide whether a callback runs, is blocked, or is marked as requiring approval.

## Run All Policy Tests

```bash
pnpm policy:test:all
```

Run one example suite:

```bash
pnpm policy:test:support-refund
pnpm policy:test:openai-style
pnpm policy:test:mcp-style
pnpm policy:test:approval-evidence
```

The runner exits non-zero if any case fails.

## Case File Format

Policy case files are YAML.

```yaml
version: 1
cases:
  - name: small refund is allowed
    input:
      agent: support-agent
      tool: stripe.refund
      args:
        amount: 20
      context:
        environment: production
    expect:
      decision: allow
      matchedPolicyId: allow-small-refunds
```

Each case includes:

- `name`: readable test name.
- `input.agent`: agent identifier.
- `input.tool`: tool name.
- `input.args`: tool arguments.
- `input.context`: optional runtime context.
- `expect.decision`: expected decision.
- `expect.matchedPolicyId`: optional expected matched policy id.

If `matchedPolicyId` is omitted, the simulator only checks the decision.

## Readable Output

Passing output:

```text
PASS small refund is allowed -> allow (allow-small-refunds)

Policy tests: 1/1 passed
```

Failing output:

```text
FAIL small refund is allowed -> allow (allow-small-refunds)
  - expected decision block, received allow

Policy tests: 0/1 passed
```

## Add Policy Tests to CI

Add the root script to CI after build/test/lint:

```bash
pnpm policy:test:all
```

This validates the starter policies and examples without running tool callbacks.

## Direct Runner Usage

The root scripts build `@enforra/policy-simulator` and run the compiled local CLI:

```bash
pnpm --filter @enforra/policy-simulator build
node packages/policy-simulator/dist/cli.js \
  --policy policies/starter/support-agent.yaml \
  --cases examples/quickstart/support-refund-node/policy-cases.yaml
```

## Limitations

- The simulator evaluates policy only. It does not execute tool callbacks.
- It does not test audit logging.
- It does not simulate hosted approval workflows.
- It does not proxy MCP traffic or call external services.
- It does not prove that every application tool call is routed through Enforra.

Use policy tests alongside SDK tests, integration tests, and code review for risky tool wiring.
