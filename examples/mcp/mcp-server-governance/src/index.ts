import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { createEnforraClient } from "@enforra/sdk-node";
import { guardMcpTool } from "@enforra/mcp";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const policyPath = resolve(__dirname, "../policy.yaml");
const observePolicyPath = resolve(__dirname, "../policy-observe.yaml");
const auditPath = resolve(__dirname, "../.enforra/audit.jsonl");

try {
  await rm(auditPath, { force: true });
} catch {
  // Ignore
}

// ----------------------------------------------------
// 1. Enforce Mode Demo
// ----------------------------------------------------
const enforraEnforce = await createEnforraClient({
  policyPath,
  auditPath
});

const agent = "internal-agent";

// Define handlers for enforce mode
const runReportEnforce = guardMcpTool(enforraEnforce, {
  agent,
  tool: "analytics.run_report",
  execute: async (args: { reportName: string }) => {
    return { status: "success", data: `[Analytics Report Data for ${args.reportName}]` };
  }
});

const sendEmailEnforce = guardMcpTool(enforraEnforce, {
  agent,
  tool: "email.send",
  execute: async () => {
    return { messageId: "msg_98765", sent: true };
  }
});

const exportDataEnforce = guardMcpTool(enforraEnforce, {
  agent,
  tool: "customer.export_data",
  execute: async (args: { customerId: string }) => {
    return { exportUrl: `https://internal.storage/exports/cust_${args.customerId}.csv` };
  }
});

const deleteRowsEnforce = guardMcpTool(enforraEnforce, {
  agent,
  tool: "database.delete_rows",
  context: (args: { table: string; isProd?: boolean }) => ({
    environment: args.isProd === false ? "development" : "production"
  }),
  execute: async () => {
    return { deletedCount: 15 };
  }
});

console.log("====================================================");
console.log("Enforra MCP Server Governance - Enforce Mode");
console.log("====================================================\n");

// Scenario 1: report allowed
console.log("--- Scenario 1: Run Report (Allowed) ---");
const reportRes = await runReportEnforce({ reportName: "Q2-Revenue" });
console.log(`Report: Q2-Revenue`);
console.log(`Decision: ${reportRes.decision}`);
console.log(`Executed: ${reportRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${JSON.stringify(reportRes.data)}\n`);

// Scenario 2: email requires approval
console.log("--- Scenario 2: Send Email (Requires Approval) ---");
const emailRes = await sendEmailEnforce({
  to: "user@example.com",
  subject: "Invoice",
  body: "Here is your invoice."
});
console.log(`To: user@example.com`);
console.log(`Decision: ${emailRes.decision}`);
console.log(`Executed: ${emailRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${emailRes.content[0]?.text}\n`);

// Scenario 3: customer export requires approval
console.log("--- Scenario 3: Export Customer Data (Requires Approval) ---");
const exportRes = await exportDataEnforce({ customerId: "cus_9988" });
console.log(`CustomerId: cus_9988`);
console.log(`Decision: ${exportRes.decision}`);
console.log(`Executed: ${exportRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${exportRes.content[0]?.text}\n`);

// Scenario 4: database delete blocked in production
console.log("--- Scenario 4: Delete Rows in Prod (Blocked) ---");
const deleteProdRes = await deleteRowsEnforce({ table: "customers", isProd: true });
console.log(`Table: customers (production environment)`);
console.log(`Decision: ${deleteProdRes.decision}`);
console.log(`Executed: ${deleteProdRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${deleteProdRes.content[0]?.text}\n`);

// Scenario 4b: database delete allowed in non-production
console.log("--- Scenario 4b: Delete Rows in Dev (Allowed) ---");
const deleteDevRes = await deleteRowsEnforce({ table: "customers", isProd: false });
console.log(`Table: customers (development environment)`);
console.log(`Decision: ${deleteDevRes.decision}`);
console.log(`Executed: ${deleteDevRes.executed ? "Yes" : "No"}`);
console.log(`Response: ${JSON.stringify(deleteDevRes.data)}\n`);

// ----------------------------------------------------
// 2. Observe Mode Demo
// ----------------------------------------------------
console.log("====================================================");
console.log("Enforra MCP Server Governance - Observe Mode");
console.log("====================================================\n");

const enforraObserve = await createEnforraClient({
  policyPath: observePolicyPath,
  auditPath
});

const deleteRowsObserve = guardMcpTool(enforraObserve, {
  agent,
  tool: "database.delete_rows",
  context: (args: { table: string; isProd?: boolean }) => ({
    environment: args.isProd === false ? "development" : "production"
  }),
  execute: async () => {
    return { deletedCount: 15 };
  }
});

console.log("--- Scenario 5: Delete Rows in Prod under Observe Mode (Shadow Executed) ---");
const deleteObsRes = await deleteRowsObserve({ table: "customers", isProd: true });
console.log(`Table: customers (production environment)`);
console.log(`Decision: ${deleteObsRes.decision}`);
console.log(
  `Executed: ${deleteObsRes.executed ? "Yes" : "No"} (Under observe mode, blocked actions still execute)`
);
console.log(`Response: ${JSON.stringify(deleteObsRes.data)}\n`);

console.log("====================================================");
console.log("Local Audit Log Verification");
console.log("====================================================");
try {
  const auditLogs = await readFile(auditPath, "utf-8");
  console.log(`Audit log written locally to: ${relative(process.cwd(), auditPath)}\n`);
  console.log("Audit log contents:");
  console.log(auditLogs);
} catch (err) {
  console.error("Failed to read audit log file:", err instanceof Error ? err.message : String(err));
}
