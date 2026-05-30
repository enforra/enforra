import { db } from "./fake-db.js";

await printSection(`AI agent requested:

db.deleteTable("customers")
environment: production`);

await printSection(`customers table before: ${formatRows(db.getRowCount("customers"))} rows`);

await printSection("Running tool callback...");

// Dangerous side effect: deletes the customers table.
await db.deleteTable("customers");

await printSection(`customers table after: ${formatRows(db.getRowCount("customers"))} rows`);

console.log("DISASTER: customer table deleted");

async function printSection(text: string): Promise<void> {
  console.log(text);
  console.log("");
  await delay(700);
}

function formatRows(count: number): string {
  return count.toLocaleString("en-US");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
