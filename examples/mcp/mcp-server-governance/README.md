# MCP Server Governance Example

This example demonstrates how Enforra governs internal server tools and implements observe mode (dry-run mode) using MCP-style handlers.

## What this example shows

- **Tool Guarding**: Securing critical business tools exposed internally (data exports, notifications, and database deletes).
- **Specific Decisions**:
  - `allow`: Analytics report requests (`analytics.run_report`).
  - `block`: Database delete operations in production (`database.delete_rows`).
  - `require_approval`: Email notifications (`email.send`) and customer exports (`customer.export_data`).
- **Observe Mode**: Simulating policy checks without blocking execution. When observe mode is enabled, the policy engine evaluates actions and writes the decision (e.g. `block`), but executes the handler anyway.

## What it does NOT do

- **No Real Side Effects**: This example does not delete actual database records, send emails, or export data.
- **Not a Gateway**: It shows local-first policy evaluation embedded in the application before a mock handler runs. It is not an MCP proxy or gateway.

## Integration Flow

In enforce mode, the MCP-style tool handler starts, Enforra evaluates policy before the handler body runs, and block or require_approval decisions do not execute the handler. In observe mode, Enforra records the shadow decision but allows the handler to run for testing. The application still owns the actual tool execution.

## Policy Behavior Table

| Tool                   | Condition / Match       | Expected Decision  | Description                         |
| ---------------------- | ----------------------- | ------------------ | ----------------------------------- |
| `analytics.run_report` | Any call                | `allow`            | Safe tool allowed                   |
| `email.send`           | Any call                | `require_approval` | Require approval for outbound email |
| `customer.export_data` | Any call                | `require_approval` | Require approval for data export    |
| `database.delete_rows` | Environment is non-prod | `allow`            | Allow delete in dev/staging         |
| `database.delete_rows` | Environment is prod     | `block`            | Block database delete in production |

## Audit Log Path

Audit logs are stored locally at: `.enforra/audit.jsonl`

## Install & Run Commands

From the repository root:

```bash
# Build the example
pnpm --filter @enforra/example-mcp-server-governance build

# Run the demo
pnpm --filter @enforra/example-mcp-server-governance start
```
