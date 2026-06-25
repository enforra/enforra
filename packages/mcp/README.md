# @enforra/mcp

MCP enforcement helpers and local MCP proxy support for Enforra.

This package supports two MCP paths:

- In-server wrapping with `guardMcpTool` / `wrapMcpTool`.
- Local sidecar proxying with the `enforra-mcp-proxy` CLI.

## Local MCP Proxy

The proxy sits between an MCP client and an upstream MCP server:

```text
MCP client
-> Enforra MCP proxy
-> upstream MCP server
```

On `tools/list`, the proxy asks the upstream server for its original MCP tool definitions, normalizes them into Enforra capability records, and registers them with Enforra Cloud's Agent Capability Registry.

On `tools/call`, the proxy calls Enforra Cloud `/v1/decide` before forwarding the request upstream. If the decision is `block` or `require_approval`, the upstream MCP server is not called.

### Setup

1. Create an Enforra project.
2. Create a project API key.
3. Start or configure the upstream MCP server.
4. Create an upstream config file:

```json
{
  "transport": "stdio",
  "command": "node",
  "args": ["./examples/fake-mcp-server/dist/server.js"],
  "env": {}
}
```

5. Start the Enforra MCP proxy:

```bash
ENFORRA_API_URL=https://api-staging.enforra.com \
ENFORRA_API_KEY=<project api key> \
ENFORRA_AGENT_KEY=openclaw-agent \
ENFORRA_AGENT_NAME="OpenClaw Workspace Agent" \
ENFORRA_AGENT_PURPOSE="Developer workspace agent" \
ENFORRA_ENVIRONMENT=demo \
ENFORRA_MCP_UPSTREAM_CONFIG=./mcp-upstream.json \
enforra-mcp-proxy
```

6. Point the MCP client at the proxy command.
7. Run `tools/list`.
8. Check Agent Intelligence for MCP-discovered capabilities.
9. Create policies.
10. Run `tools/call`.
11. Check Runtime Events.

OpenClaw can use this path if it supports configuring MCP servers/tools. This package is not OpenClaw-specific.

### Capability Inference

The proxy uses explainable MCP capability inference. It does not call AI.

- `read`, `get`, `list`, `search`, `file` -> data touched includes `workspace data`, side effect `read`
- `secret`, `token`, `key`, `env`, `credential` -> data touched includes `credentials`, side effect `sensitive read`
- `terminal`, `shell`, `command`, `run`, `exec` -> data touched includes `local environment`, side effect `command_execution`
- `write`, `update`, `create`, `delete`, `deploy`, `send`, `refund` -> side effect `external_or_destructive_action`
- otherwise -> data touched `unknown`, side effect `unknown`

### Demo

```bash
pnpm demo:mcp-proxy
```

The demo uses a fake upstream MCP server and fake Enforra Cloud decisions, so it does not require an API key.

## In-Server Wrapping

Import `createEnforraClient` from `@enforra/sdk-node` and `guardMcpTool` from `@enforra/mcp`.

Create an Enforra client with a local policy path and audit path, then wrap your MCP-style tool handler with `guardMcpTool`.

If policy returns `block` or `require_approval`, the handler does not execute.

## Decisions

- `allow`: handler runs or proxy forwards upstream
- `log_only`: handler runs or proxy forwards upstream
- `block`: handler does not run and proxy does not forward upstream
- `require_approval`: handler does not run and proxy does not forward upstream

## Scope

The proxy is local and stdio-upstream only in v1. It does not provide hosted gateway behavior, OAuth, secret storage, hosted approvals, OpenClaw-specific adapters, telemetry, or remote tool execution.

## Docs

See the main repo docs:

https://github.com/enforra/enforra/blob/main/docs/mcp.md
