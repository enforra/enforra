# Policy packs

These YAML files are copy-ready templates for common agent and MCP tool risks. They use Enforra policy version 1 syntax documented in [docs/policy-language.md](../docs/policy-language.md).

## How to use

1. Copy a pack into your application (for example `./policies/coding-agent.yaml`).
2. Pass the path to `createEnforraClient({ policyPath: "..." })`.
3. Ensure `match.tool` values match the tool names your application registers. Demos use different naming (`terminal.run` vs `shell.run`, `filesystem.read` vs `file.read`).

Runnable examples may load `policies/starter/*` or example-local policies instead of these packs directly. See [docs/examples.md](../docs/examples.md) for which file each demo uses.

## Packs

| Pack                 | File                                                               | Primary demo                                                                               |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Coding agent safety  | [coding-agent-safe-defaults.yaml](coding-agent-safe-defaults.yaml) | `pnpm demo:mcp-coding` (example-local policy) or adapt for `shell.run` / `file.read` tools |
| Support agent safety | [support-agent-controls.yaml](support-agent-controls.yaml)         | `pnpm demo:support-refund`                                                                 |
| MCP production guard | [mcp-production-guard.yaml](mcp-production-guard.yaml)             | `pnpm demo:mcp-guard`                                                                      |
| Database write guard | [database-write-guard.yaml](database-write-guard.yaml)             | `pnpm demo:db-enforra`                                                                     |

Rules marked with YAML comments as not demonstrated are valid policy syntax but are not exercised by a runnable demo in this repository. Customize tool names and add policy test cases before relying on them in production.
