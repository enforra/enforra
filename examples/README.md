# Enforra Examples

Start here:

| Goal                   | Example                          | Command                                                      |
| ---------------------- | -------------------------------- | ------------------------------------------------------------ |
| Fastest demo           | quickstart/support-refund-node   | pnpm demo:support-refund                                     |
| Python SDK             | quickstart/support-refund-python | python3 examples/quickstart/support-refund-python/example.py |
| MCP guard              | mcp/mcp-tool-guard               | pnpm demo:mcp-guard                                          |
| Framework integrations | integrations                     | see examples/integrations/README.md                          |
| Audit evidence         | audit/audit-integrity            | pnpm demo:audit-integrity                                    |

## Quickstart

- [quickstart/support-refund-node](quickstart/support-refund-node): Node.js demo showing allow, require_approval, and block decisions on a Stripe refund tool.
- [quickstart/support-refund-python](quickstart/support-refund-python): Python SDK demo of the same refund scenario showing policy evaluation and observe mode.

## Framework integrations

- See [Framework Integrations README](integrations/README.md) for LangGraph, Vercel AI SDK, OpenAI Agents SDK, CrewAI, and AutoGen examples.

## MCP examples

- [mcp/mcp-tool-guard](mcp/mcp-tool-guard): Runnable demo showing Enforra MCP tool handler guarding using `@enforra/mcp`.
- [mcp/mcp-style-policy](mcp/mcp-style-policy): Starter policy pattern for MCP-style tool names at the application boundary.
- [mcp/mcp-coding-agent](mcp/mcp-coding-agent): Governs coding agent access to filesystem and terminal tools, blocking unsafe commands.
- [mcp/mcp-github-agent](mcp/mcp-github-agent): Governs GitHub agent actions like comments, issues, and pull request merges.
- [mcp/mcp-server-governance](mcp/mcp-server-governance): Demonstrates internal MCP server tool governance and policies running in dry-run/observe mode.

## Audit and evidence

- [audit/approval-evidence](audit/approval-evidence): Shows structured evidence output for allow, require_approval, block, and log_only decisions.
- [audit/audit-integrity](audit/audit-integrity): Shows optional hash-chain integrity verification on local JSONL audit logs.

## Demos

- [demos/db-delete-video](demos/db-delete-video): Contrasts a direct database delete callback with the same callback protected by Enforra.
- [demos/openai-style-tool-wrapper](demos/openai-style-tool-wrapper): Wrapper pattern for calling `enforceToolCall` before an application-owned tool callback.

## Benchmarks

- [benchmarks/policy-eval](benchmarks/policy-eval): Measures local policy evaluation throughput and latency.
