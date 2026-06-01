# Enforra MCP Server Starter Template

This template demonstrates how to protect MCP-style tool handlers using the public `@enforra/mcp` and `@enforra/sdk-node` packages.

_Note: This is an MCP-style tool handler template showing how to guard handlers before execution. It is not a full transport proxy or hosted MCP gateway._

## Setup

Install dependencies:

```bash
npm install
```

## Run

Run the tool server simulation:

```bash
npm start
```

You should see:

- `filesystem.read` for `/workspace/src/app.ts` is allowed and executes.
- `filesystem.read` for `/workspace/.env` is blocked and fails before execution.
- `terminal.run` requires approval and fails before execution.
- `github.create_issue` is allowed (in `log_only` mode) and executes.

Audit log entries are written locally to `.enforra/audit.jsonl`.

## Policy Testing

Test the policy rules:

```bash
npm run test:policy
```
