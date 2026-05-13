/* global console */
import { performance } from "node:perf_hooks";
import { createClient } from "./packages/sdk-node/dist/index.js";
import { evaluatePolicy } from "./packages/policy-core/dist/index.js";

const iterations = 100_000;
const policyFile = {
  version: 1,
  defaults: {
    decision: "block"
  },
  policies: [
    {
      id: "allow-benchmark-read",
      match: {
        agent: "benchmark-agent",
        tool: "data.read"
      },
      conditions: [
        {
          field: "context.environment",
          operator: "eq",
          value: "development"
        }
      ],
      decision: "allow"
    }
  ]
};

const input = {
  agent: "benchmark-agent",
  tool: "data.read",
  args: {
    id: "record_123"
  },
  context: {
    environment: "development"
  }
};

const auditLogger = {
  async append() {
    return undefined;
  }
};

const client = createClient(policyFile, auditLogger);

const policyStartedAt = performance.now();
for (let index = 0; index < iterations; index += 1) {
  evaluatePolicy(policyFile, input);
}
const policyDurationMs = performance.now() - policyStartedAt;

const sdkStartedAt = performance.now();
for (let index = 0; index < iterations; index += 1) {
  await client.enforceToolCall({
    ...input,
    execute: async () => ({ ok: true })
  });
}
const sdkDurationMs = performance.now() - sdkStartedAt;

const results = {
  iterations,
  policyEvaluation: summarize(policyDurationMs),
  sdkWrapperWithNoopAudit: summarize(sdkDurationMs)
};

console.log(JSON.stringify(results, null, 2));

function summarize(durationMs) {
  return {
    totalMs: Math.round(durationMs * 100) / 100,
    averageMs: Math.round((durationMs / iterations) * 100_000) / 100_000
  };
}
