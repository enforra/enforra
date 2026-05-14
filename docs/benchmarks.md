# Benchmarks

Enforra includes a small local benchmark for understanding policy evaluation and SDK wrapper overhead.

The benchmark is intended as a reproducible engineering sanity check. It is not a marketing claim.

## How to Run

```bash
pnpm benchmark:all
```

Run only the policy benchmark:

```bash
pnpm benchmark:policy
```

The benchmark runs locally and makes no external API calls or hosted service calls.

## What It Measures

`examples/benchmark-policy-eval` measures:

- policy evaluation only
- policy evaluation with decision trace
- SDK `enforceToolCall` allow path with a no-op callback
- SDK `enforceToolCall` block path
- SDK `enforceToolCall` require_approval path

The SDK measurements use an in-memory no-op audit logger. They do not measure filesystem audit writes.

## How to Interpret Results

Output is intentionally plain:

```text
Enforra local benchmark

These are local machine results and not a universal performance claim.

policy evaluation:
iterations: 100000
total ms: ...
avg per decision ms: ...
```

Use the results to understand rough local overhead in your development environment. Do not treat them as universal throughput numbers.

## Example Output Shape

Example result from one local development machine:

```text
policy evaluation:
iterations: 100000
avg per decision ms: 0.00063

policy evaluation with trace:
iterations: 100000
avg per decision ms: 0.00057

sdk allow no-op:
iterations: 100000
avg per decision ms: 0.00219

sdk block:
iterations: 100000
avg per decision ms: 0.00226

sdk require_approval:
iterations: 100000
avg per decision ms: 0.00259
```

These numbers are included only as a sample output shape. Run the benchmark in your own environment before making performance assumptions.

## Local Machine Disclaimer

Results vary based on:

- CPU
- Node.js version
- system load
- power mode
- operating system
- package build state

Teams should run the benchmark in their own environment, especially if Enforra will guard high-volume or latency-sensitive tool calls.

## What It Does Not Measure

The benchmark does not measure:

- filesystem audit I/O
- network calls
- hosted service calls
- external API latency
- database writes
- real tool callback latency
- large customer-specific policy corpuses
- CI performance thresholds

It also does not make claims about maximum decisions per second.

## Why Run It Yourself

Enforra sits on the path before tool callbacks create side effects. Teams should understand the local overhead on the same Node.js version and hardware profile they use for agent workloads.

The benchmark is small by design so it can be inspected, modified, and rerun with your own policy shapes.
