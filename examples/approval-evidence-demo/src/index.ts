import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEnforraClient, type EnforceToolCallResult } from "@enforra/sdk-node";

type DemoData = {
  id: string;
  status: "created" | "sent" | "exported";
};

type DemoCall = {
  label: string;
  agent: string;
  tool: string;
  args: Record<string, unknown>;
  context?: Record<string, unknown>;
  execute: () => Promise<DemoData>;
};

type AuditLogEvent = {
  tool: string;
  status: string;
  argsRedacted: unknown;
  contextRedacted?: unknown;
};

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const policyPath = resolve(repoRoot, "policies/starter/approval-evidence.yaml");
const auditPath = resolve(repoRoot, ".enforra/audit.jsonl");

await rm(auditPath, { force: true });

const enforra = await createEnforraClient({
  policyPath,
  auditPath
});

const calls: DemoCall[] = [
  {
    label: "email.send to teammate@example.com",
    agent: "operations-agent",
    tool: "email.send",
    args: {
      recipient: "teammate@example.com",
      subject: "Deployment notes"
    },
    context: {
      environment: "production"
    },
    execute: async () => ({ id: "email_001", status: "sent" })
  },
  {
    label: "email.send to external@example.com",
    agent: "operations-agent",
    tool: "email.send",
    args: {
      recipient: "external@example.com",
      subject: "Customer update"
    },
    context: {
      environment: "production"
    },
    execute: async () => ({ id: "email_002", status: "sent" })
  },
  {
    label: "customer.export in production",
    agent: "operations-agent",
    tool: "customer.export",
    args: {
      segment: "enterprise"
    },
    context: {
      environment: "production"
    },
    execute: async () => ({ id: "export_001", status: "exported" })
  },
  {
    label: "github.create_issue",
    agent: "operations-agent",
    tool: "github.create_issue",
    args: {
      repo: "enforra/enforra",
      title: "Follow up on audit evidence"
    },
    context: {
      environment: "development"
    },
    execute: async () => ({ id: "issue_001", status: "created" })
  }
];

console.log("Enforra approval evidence demo\n");

for (const call of calls) {
  const result = await enforra.enforceToolCall<DemoData>({
    agent: call.agent,
    tool: call.tool,
    args: call.args,
    context: call.context,
    execute: call.execute
  });

  console.log(call.label);
  console.log(JSON.stringify(toEvidence(result), null, 2));
  console.log("");
}

console.log("Audit log written to .enforra/audit.jsonl");
console.log("Audit evidence summary:");
console.log(await readAuditSummary());

function toEvidence(result: EnforceToolCallResult<DemoData>) {
  return {
    decision: result.decision,
    executed: result.executed,
    reason: result.reason,
    status: statusForResult(result)
  };
}

function statusForResult(result: EnforceToolCallResult<DemoData>): string {
  if (!result.ok && result.auditFailed) {
    return "audit_failed";
  }

  if (result.decision === "allow") {
    return "executed";
  }

  if (result.decision === "log_only") {
    return "logged";
  }

  if (result.decision === "require_approval") {
    return "pending_approval";
  }

  return "blocked";
}

async function readAuditSummary(): Promise<string> {
  const auditLog = await readFile(auditPath, "utf8");
  const statuses = auditLog
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const event = JSON.parse(line) as AuditLogEvent;
      return `- ${labelForAuditEvent(event)}: ${event.status}`;
    });

  return statuses.join("\n");
}

function labelForAuditEvent(event: AuditLogEvent): string {
  if (event.tool === "email.send") {
    const recipient = getStringField(event.argsRedacted, "recipient");
    return recipient === undefined ? "email.send" : `email.send to ${recipient}`;
  }

  if (event.tool === "customer.export") {
    const environment = getStringField(event.contextRedacted, "environment");
    return environment === undefined ? "customer.export" : `customer.export in ${environment}`;
  }

  if (event.tool === "github.create_issue") {
    return "github.create_issue";
  }

  return event.tool;
}

function getStringField(value: unknown, field: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}
