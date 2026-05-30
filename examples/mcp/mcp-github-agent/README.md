# MCP GitHub Agent Example

This example demonstrates how Enforra governs a GitHub agent’s access to create issues, comment on issues, and merge pull requests using MCP-style handlers.

## What this example shows

- **Tool Guarding**: Regulating operations like creating issues, adding comments, and merging PRs.
- **Specific Decisions**:
  - `allow`: Comments on repositories evaluated as non-production.
  - `block`: Comments on production repositories (default policy block), or merging PRs into `main` or `production` branches.
  - `require_approval`: Merging PRs into feature/development branches, or creating new issues.
  - `log_only`: Reading operations like checking repository status or listing issues.

## What it does NOT do

- **No API Connections**: This example does not connect to the GitHub API, perform network requests, or modify any actual remote repositories.
- **Not a Gateway**: It shows local-first policy evaluation embedded in the application before a mock handler runs. It is not an MCP proxy or gateway.

## Integration Flow

The MCP-style tool handler starts.
Enforra evaluates policy before the handler body runs.
If the decision is allow or log_only, the handler executes.
If the decision is block or require_approval, the handler does not execute.
The application still owns the actual tool execution.

## Policy Behavior Table

| Tool                     | Condition / Match                | Expected Decision  | Description                                 |
| ------------------------ | -------------------------------- | ------------------ | ------------------------------------------- |
| `github.get_repo_status` | Any call                         | `log_only`         | Read operation is allowed and logged        |
| `github.list_issues`     | Any call                         | `log_only`         | Read operation is allowed and logged        |
| `github.create_issue`    | Any call                         | `require_approval` | Require approval for issue creation         |
| `github.comment`         | Repo is non-prod                 | `allow`            | Allow comments on dev repositories          |
| `github.comment`         | Repo is prod                     | `block`            | Block comments on production repositories   |
| `github.merge_pr`        | Branch is `main` or `production` | `block`            | Absolutely block direct merges to main/prod |
| `github.merge_pr`        | Branch is dev/feature            | `require_approval` | Require approval to merge to dev/feature    |

## Audit Log Path

Audit logs are stored locally at: `.enforra/audit.jsonl`

## Install & Run Commands

From the repository root:

```bash
# Build the example
pnpm --filter @enforra/example-mcp-github-agent build

# Run the demo
pnpm --filter @enforra/example-mcp-github-agent start
```
