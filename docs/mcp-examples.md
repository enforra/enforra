# Real-world MCP Governance Examples

This guide provides an overview of the three Model Context Protocol (MCP) tool handler governance examples available in this repository.

> [!IMPORTANT]
> **Enforra is not an MCP gateway or proxy.**
> These examples demonstrate how to guard MCP-style tool handlers _within_ your server code before execution happens. The client application still manages the actual tool runner, transport protocols, and gateway functionalities.

---

## Examples Overview

### 1. [MCP Coding Agent](../examples/mcp-coding-agent)

- **Scenario**: Regulating a developer assistant's access to local terminal and filesystem operations.
- **Tools Covered**: `filesystem.read`, `filesystem.write`, `terminal.run`.
- **Key Policy Highlights**: Block dangerous terminal actions (`rm -rf`), restrict reading private keys and `.env` files, require approval for writing files or installing dependencies (`npm install`).

### 2. [MCP GitHub Agent](../examples/mcp-github-agent)

- **Scenario**: Governing access for a GitHub bot that reviews PRs, comments on issues, and performs merges.
- **Tools Covered**: `github.get_repo_status`, `github.list_issues`, `github.create_issue`, `github.comment`, `github.merge_pr`.
- **Key Policy Highlights**: Allow commenting on development branches/repos, log status reading commands, block direct merges to `main` or `production` branches.

### 3. [MCP Server Governance](../examples/mcp-server-governance)

- **Scenario**: Governing internal-only enterprise tools exposed to team members.
- **Tools Covered**: `analytics.run_report`, `email.send`, `customer.export_data`, `database.delete_rows`.
- **Key Policy Highlights**: Demonstrates how to write rules for database deletion in production vs development, and shows **Observe Mode** (dry-run) where policy evaluation runs and logs results, but does not block execution.

---

## Comparison Table

| Example | Scenario | Tools | Decisions Shown |
| --- | --- | --- | --- |
| [mcp-coding-agent](../examples/mcp-coding-agent) | Terminal & Filesystem | `filesystem.read`, `filesystem.write`, `terminal.run` | `allow`, `block`, `require_approval` |
| [mcp-github-agent](../examples/mcp-github-agent) | GitHub Bot Actions | `github.create_issue`, `github.comment`, `github.merge_pr`, etc. | `allow`, `block`, `require_approval`, `log_only` |
| [mcp-server-governance](../examples/mcp-server-governance) | Enterprise Internal Tools | `database.delete_rows`, `email.send`, `analytics.run_report`, etc. | `allow`, `block`, `require_approval`, **Observe Mode** |

---

## When to use each example

- Use **mcp-coding-agent** if you are building terminal-executing agents, command line developer loops, or local filesystem editing engines.
- Use **mcp-github-agent** if you are integrating Enforra into a CI/CD workflow, auto-PR review tool, or repository manager.
- Use **mcp-server-governance** if you are exposing internal back-office APIs to internal agents and want to run policies in audit-only/observe mode first before enforcing them.
