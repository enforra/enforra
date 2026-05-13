# Benchmarks

This repository includes a tiny local benchmark for policy evaluation and SDK wrapper overhead.

The benchmark is intended as an engineering sanity check, not a marketing claim.

## How to Run

```bash
pnpm build
pnpm bench
```

The benchmark imports built local packages from `dist`, so run `pnpm build` first.

## What It Measures

The script measures:

- policy evaluation overhead using `@enforra/policy-core`
- SDK wrapper overhead using `@enforra/sdk-node` with an in-memory no-op audit logger

The SDK benchmark includes policy evaluation, pre-execution audit hook calls, callback execution, and final audit hook calls. It does not include filesystem audit I/O.

## Local Machine Disclaimer

Results depend on:

- CPU
- Node.js version
- system load
- power mode
- package build state

Do not compare numbers across machines without controlling the environment.

## Example Output

```json
{
  "iterations": 100000,
  "policyEvaluation": {
    "totalMs": 120,
    "averageMs": 0.0012
  },
  "sdkWrapperWithNoopAudit": {
    "totalMs": 450,
    "averageMs": 0.0045
  }
}
```

These numbers are illustrative only. Run the benchmark locally for actual values.

## Current Limitations

- no filesystem audit I/O measurement
- no large policy corpus yet
- no CI performance threshold
- no cross-runtime comparison
- no published performance claim

Future benchmark work should add larger policy sets and separate filesystem audit measurements without turning performance into an unsupported marketing claim.
