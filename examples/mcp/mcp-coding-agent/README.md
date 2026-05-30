# MCP Coding Agent Example

This example demonstrates how Enforra governs a coding agent's access to filesystem and terminal tools using MCP-style handlers.

## What this example shows

- **Tool Guarding**: Intercepting and regulating filesystem read/write and terminal execution calls before any side effects happen.
- **Specific Decisions**:
  - `allow`: Safe file reads (files located in a `/safe/` path).
  - `block`: Sensitive operations like reading `.env` configuration files or SSH private keys (`id_rsa`, `.pem`), or executing dangerous terminal commands (`rm -rf`).
  - `require_approval`: File writes and package installations (`npm install`).

## What it does NOT do

- **No Real Side Effects**: This example does not actually read or write to your local filesystem, nor does it execute any real terminal commands.
- **Not a Gateway**: It shows local-first policy evaluation embedded in the application before a mock handler runs. It is not an MCP proxy or gateway.

## Integration Flow

The MCP-style tool handler starts.
Enforra evaluates policy before the handler body runs.
If the decision is allow or log_only, the handler executes.
If the decision is block or require_approval, the handler does not execute.
The application still owns the actual tool execution.

## Policy Behavior Table

| Tool               | Condition / Match                  | Expected Decision  | Description                                     |
| ------------------ | ---------------------------------- | ------------------ | ----------------------------------------------- |
| `filesystem.read`  | `path` contains `/safe/`           | `allow`            | Safe reading allowed                            |
| `filesystem.read`  | `path` contains `.env`             | `block`            | Block access to environment variables           |
| `filesystem.read`  | `path` contains `id_rsa` or `.pem` | `block`            | Block access to private credentials             |
| `filesystem.write` | Any call                           | `require_approval` | Require approval for file modification          |
| `terminal.run`     | `command` contains `npm install`   | `require_approval` | Require approval for package installations      |
| `terminal.run`     | `command` contains `rm -rf`        | `block`            | Absolute block on destructive terminal commands |

## Audit Log Path

Audit logs are stored locally at: `.enforra/audit.jsonl`

## Install & Run Commands

From the repository root:

```bash
# Build the example
pnpm --filter @enforra/example-mcp-coding-agent build

# Run the demo
pnpm --filter @enforra/example-mcp-coding-agent start
```
