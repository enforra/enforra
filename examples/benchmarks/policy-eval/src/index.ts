import { performance } from "node:perf_hooks";
import {
  evaluatePolicy,
  evaluatePolicyWithTrace,
  type PolicyFile,
  type ToolCallInput
} from "@enforra/policy-core";
import { createClient } from "@enforra/sdk-node";

const iterations = 100_000;
const warmupIterations = 5_000;

const policyFile: PolicyFile = {
  version: 1,
  defaults: {
    decision: "block"
  },
  policies: [
    {
      id: "allow-repo-search",
      match: {
        agent: "benchmark-agent",
        tool: "repo.search"
      },
      decision: "allow"
    },
    {
      id: "approve-external-email",
      match: {
        agent: "benchmark-agent",
        tool: "email.send"
      },
      conditions: [
        {
          field: "args.recipient",
          operator: "contains",
          value: "@external.example"
        }
      ],
      decision: "require_approval"
    },
    {
      id: "block-production-export",
      match: {
        agent: "benchmark-agent",
        tool: "customer.export"
      },
      conditions: [
        {
          field: "context.environment",
          operator: "eq",
          value: "production"
        }
      ],
      decision: "block"
    },
    {
      id: "log-issue-creation",
      match: {
        agent: "benchmark-agent",
        tool: "github.create_issue"
      },
      decision: "log_only"
    }
  ]
};

const allowInput: ToolCallInput = {
  agent: "benchmark-agent",
  tool: "repo.search",
  args: {
    query: "createEnforraClient"
  },
  context: {
    environment: "development"
  }
};

const approvalInput: ToolCallInput = {
  agent: "benchmark-agent",
  tool: "email.send",
  args: {
    recipient: "admin@external.example"
  },
  context: {
    environment: "production"
  }
};

const blockInput: ToolCallInput = {
  agent: "benchmark-agent",
  tool: "customer.export",
  args: {
    segment: "enterprise"
  },
  context: {
    environment: "production"
  }
};

const noopAuditLogger = {
  async append() {
    return {
      id: "benchmark",
      timestamp: new Date(0).toISOString(),
      agent: "benchmark-agent",
      tool: "benchmark.tool",
      decision: "allow" as const,
      status: "executed" as const,
      argsRedacted: {}
    };
  }
};

const client = createClient(policyFile, noopAuditLogger);

console.log("Enforra local benchmark\n");
console.log("These are local machine results and not a universal performance claim.\n");

warmup();

printResult(
  "policy evaluation",
  measureSync(() => {
    evaluatePolicy(policyFile, allowInput);
  })
);

printResult(
  "policy evaluation with trace",
  measureSync(() => {
    evaluatePolicyWithTrace(policyFile, allowInput);
  })
);

printResult(
  "sdk allow no-op",
  await measureAsync(async () => {
    await client.enforceToolCall({
      ...allowInput,
      execute: async () => ({ ok: true })
    });
  })
);

printResult(
  "sdk block",
  await measureAsync(async () => {
    await client.enforceToolCall({
      ...blockInput,
      execute: async () => ({ ok: true })
    });
  })
);

printResult(
  "sdk require_approval",
  await measureAsync(async () => {
    await client.enforceToolCall({
      ...approvalInput,
      execute: async () => ({ ok: true })
    });
  })
);

function warmup(): void {
  for (let index = 0; index < warmupIterations; index += 1) {
    evaluatePolicy(policyFile, allowInput);
    evaluatePolicyWithTrace(policyFile, allowInput);
  }
}

function measureSync(callback: () => void): number {
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    callback();
  }

  return performance.now() - startedAt;
}

async function measureAsync(callback: () => Promise<void>): Promise<number> {
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await callback();
  }

  return performance.now() - startedAt;
}

function printResult(label: string, durationMs: number): void {
  console.log(`${label}:`);
  console.log(`iterations: ${iterations}`);
  console.log(`total ms: ${round(durationMs)}`);
  console.log(`avg per decision ms: ${round(durationMs / iterations)}`);
  console.log("");
}

function round(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}
