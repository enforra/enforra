import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient } from "@enforra/sdk-node";

interface DemoAction {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

interface ToolResult {
  status: "executed";
  tool: string;
}

const exampleRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const repoRoot = resolve(exampleRoot, "../../../");
const policyPath = resolve(exampleRoot, "policy.yaml");
const auditPath = resolve(repoRoot, ".enforra/field-service-production-boundary.jsonl");

const enforra = await createEnforraClient({ policyPath, auditPath });

const actions: DemoAction[] = [
  {
    label: "Read job history",
    tool: "jobs.read",
    args: { jobId: "job_1042" }
  },
  {
    label: "Create an estimate draft",
    tool: "estimates.create",
    args: { jobId: "job_1042", amount: 4800, status: "draft" }
  },
  {
    label: "Send a high-value quote",
    tool: "quotes.send",
    args: { jobId: "job_1042", customerId: "customer_772", amount: 12500 }
  },
  {
    label: "Export customer data to an unapproved destination",
    tool: "customers.export",
    args: { customerId: "customer_772", destinationClass: "unapproved_external" }
  }
];

console.log("Enforra field-service production boundary demo");
console.log("Clone evaluation: PASSED");
console.log("Runtime environment: production\n");

let stoppedBeforeExecution = 0;

for (const action of actions) {
  let handlerExecuted = false;

  const result = await enforra.enforceToolCall<ToolResult>({
    agent: "field-service-operations-agent",
    tool: action.tool,
    args: action.args,
    context: {
      environment: "production",
      cloneEvalStatus: "passed",
      cloneEvalSuite: "field-service-v1"
    },
    execute: async () => {
      handlerExecuted = true;
      return { status: "executed", tool: action.tool };
    }
  });

  console.log(`Action: ${action.label}`);
  console.log(`Tool: ${action.tool}`);
  console.log(`Production decision: ${result.decision}`);
  console.log(`Handler executed: ${handlerExecuted ? "yes" : "no"}`);

  if (!handlerExecuted) {
    stoppedBeforeExecution += 1;
    console.log("Boundary proof: side effect stopped before the tool handler");
  }

  if (!result.ok) {
    console.log(`Reason: ${result.reason}`);
  }

  console.log("");
}

console.log(`Protected actions stopped before execution: ${stoppedBeforeExecution}`);
console.log("Audit evidence written to .enforra/field-service-production-boundary.jsonl");
