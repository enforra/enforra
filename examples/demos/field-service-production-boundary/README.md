# Field-service production boundary demo

This demo shows the gap between an agent passing an evaluation in a cloned environment and being allowed to perform the same action in a real production system.

The simulated field-service agent has already passed its clone evaluation. Enforra still evaluates each production tool call immediately before the application-owned handler runs.

## Actions

| Production action | Decision |
| --- | --- |
| Read job history | allow |
| Create an estimate draft | allow |
| Send a quote above 10,000 | require_approval |
| Export customer data to an unapproved destination | block |

For approval-gated and blocked calls, the demo prints `Handler executed: no`. This proves the side effect was stopped before the tool handler.

## Run

From the repository root:

```bash
pnpm install
pnpm demo:field-service-boundary
```

Test the policy cases without executing any tool handlers:

```bash
pnpm policy:test:field-service-boundary
```

Audit evidence is written to:

```text
.enforra/field-service-production-boundary.jsonl
```

## Integration point

A clone or eval platform can pass evaluation metadata in the tool-call context, as shown with `cloneEvalStatus: passed`. Passing an eval is useful evidence, but it does not bypass the production policy boundary.
