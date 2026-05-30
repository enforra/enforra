# MCP-Style Tool Policy Example

This example shows how to apply policy to MCP-like tool names at the application boundary.

This is not an MCP gateway or proxy. It does not speak MCP, proxy MCP traffic, or execute remote MCP tools.

No external API calls are made. Each callback returns local mock data.

## Policy Used

```text
policies/starter/mcp-tools.yaml
```

The example evaluates:

- `mcp.read`
- `mcp.write`
- `shell.execute`

## Run

```bash
pnpm demo:mcp-style
```

## Expected Output

```text
Enforra MCP-style tool policy demo

Tool call: mcp.read
Agent: mcp-agent
Decision: allow
Executed: yes

Tool call: mcp.write
Agent: mcp-agent
Decision: require_approval
Executed: no
Reason: matched policy approve-write-tools

Tool call: shell.execute
Agent: mcp-agent
Decision: block
Executed: no
Reason: matched policy block-shell-execution

Audit log written to .enforra/audit.jsonl
```

## Why Each Decision Happens

- `mcp.read` has `args.approved: true`, so it matches `allow-approved-read-only-tools` and executes.
- `mcp.write` matches `approve-write-tools`, so it is marked as requiring approval and does not execute.
- `shell.execute` matches `block-shell-execution`, so it is blocked and does not execute.

## What Should and Should Not Execute

Only the `allow` decision executes the callback.

The `require_approval` and `block` decisions do not execute callbacks in the local OSS runtime.

## Audit Logs

Audit logs are written to:

```text
.enforra/audit.jsonl
```

The allowed call writes `decision_logged` and `executed`. The approval-required and blocked calls write `pending_approval` and `blocked`.
