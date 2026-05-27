# Integrations

Enforra wraps tool execution in common AI agent framework patterns. The core integration pattern is the same across all frameworks: Enforra evaluates a local YAML policy **before** the tool callback runs and returns one of four decisions: `allow`, `block`, `require_approval`, or `log_only`.

These are integration examples and patterns, not hosted proxies or certified framework partnerships.

## Packages

| Language | Package             | Install                         |
| -------- | ------------------- | ------------------------------- |
| Python   | `enforra`           | `pip install enforra`           |
| Node.js  | `@enforra/sdk-node` | `npm install @enforra/sdk-node` |
| MCP      | `@enforra/mcp`      | `npm install @enforra/mcp`      |
| CLI      | `@enforra/cli`      | `npx @enforra/cli`              |

## Framework Integration Docs

- [LangGraph (Python)](integrations/langgraph.md)
- [OpenAI Agents SDK (Python)](integrations/openai-agents.md)
- [Vercel AI SDK (Node.js)](integrations/vercel-ai-sdk.md)
- [CrewAI (Python)](integrations/crewai.md)
- [AutoGen (Python)](integrations/autogen.md)
- [MCP-Style Tool Handlers (Node.js)](mcp.md)

## How It Works

```
Agent Framework → Plans tool call → Enforra evaluates policy → allow/block/require_approval/log_only → Tool callback runs (or not)
```

Enforra does not replace your agent framework. It sits inside your tool function and decides whether the side-effect callback should run.

## Local-First

All examples run locally without Enforra Cloud. They use local YAML policies and write local JSONL audit logs.

Enforra Cloud is optional and separate. It provides team workflows, dashboards, hosted audit retention, approvals, rollout controls, analytics, and organization-level management.

## Policy Testing

You can validate policies locally using the CLI:

```bash
npx @enforra/cli test --policy policy.yaml --cases policy-cases.yaml
```
