# Policy Evaluation Benchmark

This example runs a small local benchmark for policy evaluation and SDK wrapper overhead.

No external API calls are made. No hosted service is called. The SDK uses an in-memory no-op audit logger.

## Run

```bash
pnpm benchmark:policy
```

## What It Measures

- policy evaluation only
- policy evaluation with decision trace
- SDK `enforceToolCall` allow path with no-op execute
- SDK `enforceToolCall` block path
- SDK `enforceToolCall` require_approval path

These are local machine results, not universal performance claims.
