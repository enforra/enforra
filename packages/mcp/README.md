# @enforra/mcp

Lightweight MCP-style tool handler enforcement for Enforra.

This package helps you wrap MCP-style tool handlers so Enforra policy is evaluated before the handler executes.

It is not an MCP gateway, MCP proxy, auth layer, connector framework, or hosted approval system. The application still owns tool execution.

## Install

npm install @enforra/mcp @enforra/sdk-node

## Usage

Import createEnforraClient from @enforra/sdk-node and guardMcpTool from @enforra/mcp.

Create an Enforra client with a local policy path and audit path, then wrap your MCP-style tool handler with guardMcpTool.

If policy returns block or require_approval, the handler does not execute.

## Decisions

- allow: handler runs
- log_only: handler runs and audit evidence is written
- block: handler does not run
- require_approval: handler does not run in the OSS runtime

## Scope

@enforra/mcp wraps MCP-style tool handlers before execution.

It does not provide:

- MCP gateway/proxy behavior
- OAuth or auth
- hosted approvals
- connectors
- telemetry
- cloud calls
- remote tool execution

## Docs

See the main repo docs:

https://github.com/enforra/enforra/blob/main/docs/mcp.md
