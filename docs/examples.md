# Enforra examples

These examples show Enforra enforcing policy before agent or MCP tool execution. The caller owns execution. Enforra decides whether the action is allowed, blocked, approval required, or log only, and writes a local audit record. Enforra does not execute tools itself.

In the OSS runtime, `require_approval` means your application must pause and handle approval locally. It is not a hosted approval queue, Slack workflow, or dashboard feature.

## Pack overview

| Use case pack                                             | Primary command            | Policy (demo)                                                                             | Audit log                                            |
| --------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [Coding agent safety](use-cases/coding-agent-safety.md)   | `pnpm demo:mcp-coding`     | [examples/mcp/mcp-coding-agent/policy.yaml](../examples/mcp/mcp-coding-agent/policy.yaml) | `examples/mcp/mcp-coding-agent/.enforra/audit.jsonl` |
| [Support agent safety](use-cases/support-agent-safety.md) | `pnpm demo:support-refund` | [policies/starter/support-agent.yaml](../policies/starter/support-agent.yaml)             | `.enforra/audit.jsonl` (repo root)                   |
| [MCP production guard](use-cases/mcp-production-guard.md) | `pnpm demo:mcp-guard`      | [policies/starter/mcp-tools.yaml](../policies/starter/mcp-tools.yaml)                     | `.enforra/mcp-demo-audit.jsonl` (repo root)          |
| [Database write guard](use-cases/database-write-guard.md) | `pnpm demo:db-enforra`     | [policies/starter/db-delete-video.yaml](../policies/starter/db-delete-video.yaml)         | `.enforra/audit.jsonl` (demo working directory)      |

Copy-ready policy templates live in [policy-packs/](../policy-packs/). Demos may load `policies/starter/*` or example-local YAML; tool names in your policy must match your handlers exactly.

---

## 1. Coding agent safety

**Use case:** A coding agent tries to run shell, file, git, or production-related actions.

**Risk:** Dangerous shell commands, production commands, file deletion, secret access, package installs.

**Example:** [examples/mcp/mcp-coding-agent](../examples/mcp/mcp-coding-agent)

**Command:**

```bash
pnpm demo:mcp-coding
```

**Policy (demo):** [examples/mcp/mcp-coding-agent/policy.yaml](../examples/mcp/mcp-coding-agent/policy.yaml)

**Policy pack (template):** [policy-packs/coding-agent-safe-defaults.yaml](../policy-packs/coding-agent-safe-defaults.yaml) — uses `shell.run` / `file.read` tool names; align with your handlers.

**Secondary (SDK `enforceToolCall` wrapper):**

```bash
pnpm demo:openai-style
```

**Policy (demo):** [policies/starter/openai-style-agent.yaml](../policies/starter/openai-style-agent.yaml). **Audit:** `.enforra/audit.jsonl` at repo root.

**Expected decisions (primary demo — from `pnpm demo:mcp-coding`):**

| Tool               | Scenario                   | Decision           | Matched policy                          | Executed |
| ------------------ | -------------------------- | ------------------ | --------------------------------------- | -------- |
| `filesystem.read`  | path `/safe/src/index.ts`  | `allow`            | `allow-safe-file-read`                  | yes      |
| `filesystem.read`  | path `/app/.env`           | `block`            | `block-env-read`                        | no       |
| `filesystem.read`  | path `/user/.ssh/id_rsa`   | `block`            | `block-private-key-read`                | no       |
| `filesystem.write` | write `/safe/new-file.ts`  | `require_approval` | `require-approval-filesystem-write`     | no       |
| `terminal.run`     | `npm install @enforra/mcp` | `require_approval` | `require-approval-terminal-npm-install` | no       |
| `terminal.run`     | `rm -rf /usr/bin`          | `block`            | `block-terminal-rm-rf`                  | no       |

**Audit log path:** `examples/mcp/mcp-coding-agent/.enforra/audit.jsonl`

**Detail:** [use-cases/coding-agent-safety.md](use-cases/coding-agent-safety.md)

---

## 2. Support agent safety

**Use case:** A support agent can issue refunds or update customer records.

**Risk:** Wrong refund amount, refund above limit, customer data mutation without approval.

**Example:** [examples/quickstart/support-refund-node](../examples/quickstart/support-refund-node)

**Command:**

```bash
pnpm demo:support-refund
```

**Policy (demo):** [policies/starter/support-agent.yaml](../policies/starter/support-agent.yaml)

**Policy pack (template):** [policy-packs/support-agent-controls.yaml](../policy-packs/support-agent-controls.yaml)

**Policy test (no callback execution):**

```bash
pnpm policy:test:support-refund
```

**Expected decisions (from `pnpm demo:support-refund`):**

| Tool            | Amount | Decision           | Matched policy           | Executed |
| --------------- | ------ | ------------------ | ------------------------ | -------- |
| `stripe.refund` | 20     | `allow`            | `allow-small-refunds`    | yes      |
| `stripe.refund` | 250    | `require_approval` | `approve-medium-refunds` | no       |
| `stripe.refund` | 1000   | `block`            | `block-large-refunds`    | no       |

All three calls use `agent: support-agent` and `context.environment: production`.

**Audit log path:** `.enforra/audit.jsonl` at repository root

**Detail:** [use-cases/support-agent-safety.md](use-cases/support-agent-safety.md)

---

## 3. MCP production guard

**Use case:** An MCP-style tool handler is about to run.

**Risk:** The agent asks for a risky MCP tool call, such as `mcp.shell.run` in production.

**Example:** [examples/mcp/mcp-tool-guard](../examples/mcp/mcp-tool-guard)

**Command:**

```bash
pnpm demo:mcp-guard
```

**Policy (demo):** [policies/starter/mcp-tools.yaml](../policies/starter/mcp-tools.yaml)

**Policy pack (template):** [policy-packs/mcp-production-guard.yaml](../policy-packs/mcp-production-guard.yaml)

**Policy test:**

```bash
pnpm policy:test:mcp-style
```

**Expected decisions (from `pnpm demo:mcp-guard`):**

| Tool                   | Scenario                                           | Decision           | Matched policy                      | Executed |
| ---------------------- | -------------------------------------------------- | ------------------ | ----------------------------------- | -------- |
| `mcp.shell.run`        | `isProd: true` → `context.environment: production` | `block`            | `block-shell-run-prod`              | no       |
| `mcp.filesystem.write` | write `/safe/app.log`                              | `require_approval` | `require-approval-filesystem-write` | no       |
| `mcp.filesystem.read`  | path `/safe/config.json`                           | `allow`            | `allow-safe-filesystem-read`        | yes      |
| `mcp.filesystem.read`  | path `/etc/passwd` (no rule match)                 | `block`            | none (default `block`)              | no       |

**Audit log path:** `.enforra/mcp-demo-audit.jsonl` at repository root

**Detail:** [use-cases/mcp-production-guard.md](use-cases/mcp-production-guard.md)

---

## 4. Database write guard

**Use case:** An agent tries to write, update, or delete data.

**Risk:** Unapproved production mutation, delete action, high-impact database change.

**Example:** [examples/demos/db-delete-video](../examples/demos/db-delete-video)

**Command:**

```bash
pnpm demo:db-enforra
```

**Policy (demo):** [policies/starter/db-delete-video.yaml](../policies/starter/db-delete-video.yaml)

**Policy pack (template):** [policy-packs/database-write-guard.yaml](../policy-packs/database-write-guard.yaml)

**Contrast (no Enforra):** `pnpm demo:db-unsafe` runs the callback directly and deletes the fake `customers` table.

**Expected decisions (from `pnpm demo:db-enforra`):**

| Tool             | Scenario                                    | Decision | Matched policy                     | Executed |
| ---------------- | ------------------------------------------- | -------- | ---------------------------------- | -------- |
| `db.deleteTable` | `args.table: customers`, production context | `block`  | `block-production-customer-delete` | no       |

Demo prints `customers` table before: 1,284 rows and after: 1,284 rows (`Callback executed: no`).

**Audit log path:** `.enforra/audit.jsonl` in the demo working directory

**Detail:** [use-cases/database-write-guard.md](use-cases/database-write-guard.md)

---

## Related examples

- **Framework integrations:** [docs/integrations.md](integrations.md) and [examples/integrations](../examples/integrations)
- **Observe mode:** `pnpm demo:observe` (support refund policy shadowing)
- **Approval and audit evidence:** `pnpm demo:approval-evidence`, `pnpm demo:audit-integrity`
- **`log_only` on read tools:** `pnpm demo:mcp-github` — see [docs/mcp-examples.md](mcp-examples.md)
- **More MCP scenarios:** `pnpm demo:mcp-governance`, `pnpm demo:mcp-style`
- **Policy benchmarks:** `pnpm benchmark:policy`

## Folder index

For paths grouped by folder name, see [examples/README.md](../examples/README.md).
