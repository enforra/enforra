# Scope

This repository contains the local open source runtime core for Enforra.

It focuses on application-level action governance:

- local policy loading and validation
- typed tool-call enforcement
- fail-closed behavior for blocked and approval-required actions
- local audit evidence with redaction
- small examples that demonstrate the enforcement boundary

## Out of Scope

This repository does not include a hosted API, cloud dashboard, hosted audit retention, team approval workflows, auth, billing, RBAC, SSO, Slack or email approvals, compliance reports, remote tool execution, or MCP gateway behavior.

It is not an MCP proxy, model firewall, kernel sandbox, or prompt-injection detector.

Developers provide their own agent and tools. Enforra decides whether the local `execute` callback should run.
