# Decision Trace

Decision trace explains why Enforra returned a policy decision for a tool call.

It is useful when a policy author needs to understand why a tool call was allowed, blocked, marked as requiring approval, logged, or sent to the default decision.

## What Trace Includes

`evaluatePolicyWithTrace` returns the normal policy evaluation result plus a `trace` object.

The trace includes:

- policy IDs evaluated in order
- whether each evaluated policy matched
- why a policy did not match
- agent and tool match checks
- condition checks for `args.*` and `context.*`
- actual values
- expected values
- operators
- pass/fail status for each check
- final matched policy ID
- final decision
- whether a default decision was used

## Example

```ts
import { evaluatePolicyWithTrace } from "@enforra/policy-core";

const result = evaluatePolicyWithTrace(policyFile, {
  agent: "support-agent",
  tool: "stripe.refund",
  args: { amount: 250 },
  context: { environment: "production" }
});

console.log(result.decision);
console.log(result.trace.finalMatchedPolicyId);
console.log(result.trace.policies);
```

## Trace vs Audit Logs

Decision trace is in-memory developer output.

Audit logs are persisted local JSONL events written by `@enforra/local-audit`.

Important differences:

- trace is for debugging and policy authoring
- audit logs are for local evidence of decisions and execution status
- trace is not redacted by policy-core
- audit logs redact common secret fields and error patterns before writing

Do not persist raw trace output if your tool-call input may contain sensitive values.

## Use Trace in Policy Tests

The policy simulator supports `--trace`.

```bash
node packages/policy-simulator/dist/cli.js \
  --policy policies/starter/support-agent.yaml \
  --cases examples/support-refund-agent/policy-cases.yaml \
  --trace
```

Normal policy test output stays concise. When `--trace` is enabled, failed cases include trace details to show why the actual decision differed from the expected decision.

## Limitations

- Trace does not execute tool callbacks.
- Trace does not test audit logging.
- Trace is not redacted.
- Trace does not detect prompt injection.
- Trace does not prove every application tool call is routed through Enforra.

Use decision trace with policy tests, SDK tests, and code review for risky tool wiring.
