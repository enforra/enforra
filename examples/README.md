# Enforra Examples

## Start Here

| Goal                                              | Example                       | Command                                                   |
| ------------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| See allow / block / require_approval in 2 minutes | `support-refund-agent`        | `pnpm demo:support-refund`                                |
| Try the Python SDK                                | `python-support-refund-agent` | `python3 examples/python-support-refund-agent/example.py` |
| See MCP-style tool guarding                       | `mcp-tool-guard-demo`         | `pnpm demo:mcp-guard`                                     |
| See framework integrations                        | `integrations/`               | see `examples/integrations/README.md`                     |
| See audit log integrity                           | `audit-integrity-demo`        | `pnpm demo:audit-integrity`                               |

---

## Core Demos

### `support-refund-agent`

Node.js demo showing allow, require_approval, and block decisions on a fake Stripe refund tool. The fastest way to see Enforra working locally.

```bash
pnpm demo:support-refund
```

### `python-support-refund-agent`

Python SDK demo of the same refund scenario. Also shows observe mode, where policy is evaluated and logged but all callbacks execute.

```bash
python3 examples/python-support-refund-agent/example.py
python3 examples/python-support-refund-agent/example.py --observe
```

### `openai-style-tool-wrapper`

Wrapper pattern for calling `enforceToolCall` before an application-owned tool callback. Shows the placement point without a full framework dependency.

```bash
pnpm demo:openai-style
```

---

## MCP Demos

### `mcp-style-tool-policy`

Starter policy pattern for MCP-style tool names at the application boundary. Does not implement an MCP gateway or proxy.

```bash
pnpm demo:mcp-style
```

### `mcp-tool-guard-demo`

Runnable demo of Enforra MCP tool handler guarding using `@enforra/mcp`. Shows `guardMcpTool` wrapping a handler inside an MCP server.

```bash
pnpm demo:mcp-guard
```

### `mcp-coding-agent`

Governs coding agent access to filesystem and terminal tools, blocking rm -rf and requiring approval for installs.

```bash
pnpm demo:mcp-coding
```

### `mcp-github-agent`

Governs GitHub agent actions like comments, issues, and PR merges, blocking merges to main.

```bash
pnpm demo:mcp-github
```

### `mcp-server-governance`

Demonstrates internal server tool governance and policies running in dry-run/observe mode.

```bash
pnpm demo:mcp-governance
```

---

## Framework Integrations

See [`examples/integrations/README.md`](integrations/README.md) for the full guide.

Quick reference:

| Framework         | Status                | Example                             |
| ----------------- | --------------------- | ----------------------------------- |
| LangGraph         | Real runnable example | `integrations/langgraph-python`     |
| Vercel AI SDK     | Real runnable example | `integrations/vercel-ai-sdk-node`   |
| OpenAI Agents SDK | Real tool API example | `integrations/openai-agents-python` |
| CrewAI            | Pattern only          | `integrations/crewai-python`        |
| AutoGen           | Pattern only          | `integrations/autogen-python`       |

---

## Audit and Evidence Demos

### `approval-evidence-demo`

Shows structured evidence output for allow, require_approval, block, and log_only decisions. Useful for understanding what gets logged.

```bash
pnpm demo:approval-evidence
```

### `audit-integrity-demo`

Shows optional hash-chain integrity verification on local JSONL audit logs.

```bash
pnpm demo:audit-integrity
```

---

## Video / Demo Helpers

### `db-delete-video-demo`

Contrasts a direct database delete callback with the same callback protected by Enforra. Used for demo recordings.

```bash
pnpm demo:db-unsafe
pnpm demo:db-enforra
```

---

## Benchmarks

### `benchmark-policy-eval`

Measures local policy evaluation throughput. Useful for understanding performance overhead before adopting Enforra in a high-frequency tool path.

```bash
pnpm benchmark:all
```
