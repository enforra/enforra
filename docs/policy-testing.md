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

Enforra formats results to be immediately understandable by developers and in CI logs.

Passing output:

```text
Policy test results

PASS  small refund is allowed
  agent: support-agent
  tool: stripe.refund
  expected: allow
  actual: allow
  matched policy: allow-small-refunds

Summary:
1 passed, 0 failed
```

Failing output:

```text
Policy test results

FAIL  small refund is allowed
  agent: support-agent
  tool: stripe.refund
  args: {"amount":20}
  expected: block
  actual: allow
  matched policy: allow-small-refunds
  reason: matched policy allow-small-refunds

Summary:
0 passed, 1 failed
```

### JSON Output (`--json`)

If you run the CLI with the `--json` flag, it outputs a clean, parseable JSON report:

```json
{
  "total": 1,
  "passed": 0,
  "failed": 1,
  "cases": [
    {
      "name": "small refund is allowed",
      "agent": "support-agent",
      "tool": "stripe.refund",
      "expected": "block",
      "actual": "allow",
      "matchedPolicyId": "allow-small-refunds",
      "reason": "matched policy allow-small-refunds",
      "passed": false
    }
  ]
}
```

## Add Policy Tests to CI

Add the root script to CI after build/test/lint:

```bash
pnpm policy:test:all
```

The simulator command exits with a non-zero code if any test fails, making it CI-safe and blocking merges on broken configurations.

## Direct Runner Usage

The root scripts build `@enforra/policy-simulator` and run the compiled local CLI:

```bash
pnpm --filter @enforra/policy-simulator build
node packages/policy-simulator/dist/cli.js \
  --policy policies/starter/support-agent.yaml \
  --cases examples/quickstart/support-refund-node/policy-cases.yaml
```

Options:

- `--policy <path>`: Path to the YAML policy file.
- `--cases <path>`: Path to the YAML test cases file.
- `--trace`: Enable evaluation trace printouts for failed cases.
- `--json`: Output results in structured JSON format instead of human-readable text.

## Limitations

- The simulator evaluates policy only. It does not execute real tool callbacks.
- It does not test audit logging.
- It does not simulate hosted approval workflows.
- It does not proxy MCP traffic or call external services.
- It does not prove that every application tool call is routed through Enforra.

Use policy tests alongside SDK tests, integration tests, and code review for risky tool wiring.
