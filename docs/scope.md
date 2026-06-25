# Scope

This repository contains the local open source runtime core for Enforra.

It focuses on application-level action governance:

- local policy loading and validation
- typed tool-call enforcement
- fail-closed behavior for blocked and approval-required actions
- local audit evidence with redaction
- small examples that demonstrate the enforcement boundary

## Out of Scope

This repository contains the open-source local runtime core. It does not include the hosted Enforra Cloud application, cloud dashboard, hosted audit retention, team approval workflows, billing, SSO, or organization management.

The local runtime core is not a model firewall, kernel sandbox, or prompt-injection detector. The repository also includes an optional local MCP sidecar proxy in `@enforra/mcp`.

Developers provide their own agent and tools. Enforra decides whether the local `execute` callback should run.
