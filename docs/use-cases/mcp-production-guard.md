# MCP production guard

MCP-style tool handlers in your server should not run risky tools in production without policy checks first.

## Problem

When an agent invokes tools such as shell execution or filesystem access through MCP-style handlers, the risky moment is immediately before your handler body runs. This use case guards handlers you own in application code. For the optional local sidecar proxy path, see [MCP Integration](../mcp.md).

## What Enforra checks

- `agent` (`mcp-agent`)
- `tool` (`mcp.shell.run`, `mcp.filesystem.read`, `mcp.filesystem.write`, and tools you register)
- `args.path`, `args.command`, `args.approved`
- `context.environment` (demo derives this from `isProd` in handler args)

## Policy behavior

| Scenario                                          | Decision           | Handler runs |
| ------------------------------------------------- | ------------------ | ------------ |
| `mcp.shell.run` with production context           | `block`            | no           |
| `mcp.filesystem.write`                            | `require_approval` | no           |
| `mcp.filesystem.read` with `/safe/` in path       | `allow`            | yes          |
| `mcp.filesystem.read` outside safe path (default) | `block`            | no           |

Non-production `mcp.shell.run` is `allow` per [policies/starter/mcp-tools.yaml](../../policies/starter/mcp-tools.yaml) but is not exercised in the four-scenario demo loop.

## Run the example

```bash
pnpm demo:mcp-guard
```

Policy test:

```bash
pnpm policy:test:mcp-style
```

**Demo policy:** [policies/starter/mcp-tools.yaml](../../policies/starter/mcp-tools.yaml)

**Policy pack (copy-ready template):** [policy-packs/mcp-production-guard.yaml](../../policy-packs/mcp-production-guard.yaml)— not loaded by the commands above. It is provided as a reusable starter policy for this use case.

Example code: [examples/mcp/mcp-tool-guard](../../examples/mcp/mcp-tool-guard) uses `guardMcpTool` from `@enforra/mcp`.

## Expected result

```text
--- Scenario 1: Run mcp.shell.run in PRODUCTION ---
Decision: block
Executed: No

--- Scenario 2: Run mcp.filesystem.write (Requires Approval) ---
Decision: require_approval
Executed: No

--- Scenario 3: Run mcp.filesystem.read (Safe path - containing /safe/) ---
Decision: allow
Executed: Yes

--- Scenario 4: Run mcp.filesystem.read (Unsafe path - defaults to block) ---
Decision: block
Executed: No

Audit log written locally to: .enforra/mcp-demo-audit.jsonl
```

## Audit record

```text
.enforra/mcp-demo-audit.jsonl
```

(at repository root). This demo intentionally uses a dedicated audit path, not the default `.enforra/audit.jsonl`.

## What this proves

`guardMcpTool` evaluates policy before the mock handler returns content. Production shell requests are blocked before any mock execution string is produced. Enforra does not terminate real processes or replace MCP transport.

## Core model

```text
MCP-style handler invoked → Enforra policy → decision → handler body only if allow or log_only → local audit
```

Default `decision: block` means unknown tools do not execute unless a rule explicitly allows them.
