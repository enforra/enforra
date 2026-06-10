# Coding agent safety

Coding agents should not run destructive commands, read secrets, or modify the environment just because the model asked.

## Problem

A coding agent may run shell commands, edit files, install packages, or read sensitive paths. Prompt instructions can be missed or ignored. Control needs to sit before the action runs, at the point where your application would invoke the tool callback.

## What Enforra checks

Enforra evaluates policy on each tool request using metadata your application passes in:

- `agent` (for example `coding-agent`)
- `tool` (for example `filesystem.read`, `terminal.run`)
- `args` (for example `path`, `command`, `content`)
- `context` (for example `environment`)

Conditions use dot paths such as `args.path` and `context.environment`. See [policy language](../policy-language.md).

## Policy behavior

Primary demo (`pnpm demo:mcp-coding`):

| Scenario                  | Decision           | Callback runs |
| ------------------------- | ------------------ | ------------- |
| Read file under `/safe/`  | `allow`            | yes           |
| Read `.env`               | `block`            | no            |
| Read SSH private key path | `block`            | no            |
| Write file                | `require_approval` | no            |
| `npm install` in terminal | `require_approval` | no            |
| `rm -rf` in terminal      | `block`            | no            |

Secondary demo (`pnpm demo:openai-style`) uses `enforceToolCall` with `repo.search` → `allow`, `email.send` to external recipient → `require_approval`, `customer.export` in production → `block`.

The [policy pack](../../policy-packs/coding-agent-safe-defaults.yaml) uses `shell.run`, `file.read`, and `package.install` tool names. Your handlers must use the same names in `match.tool` for rules to apply.

## Run the example

From the repository root:

```bash
pnpm demo:mcp-coding
```

SDK wrapper alternative:

```bash
pnpm demo:openai-style
```

Policy test for the openai-style starter policy:

```bash
pnpm policy:test:openai-style
```

**Demo policy:** [examples/mcp/mcp-coding-agent/policy.yaml](../../examples/mcp/mcp-coding-agent/policy.yaml)

**Policy pack template:** [policy-packs/coding-agent-safe-defaults.yaml](../../policy-packs/coding-agent-safe-defaults.yaml) — not loaded by the commands above. It is provided as a reusable starter policy for this use case.

## Expected result

```text
--- Scenario 1: Safe Read (Allowed) ---
Decision: allow
Executed: Yes

--- Scenario 2: Sensitive Read (.env Blocked) ---
Decision: block
Executed: No

--- Scenario 6: Dangerous Command (Blocked) ---
Decision: block
Executed: No
```

## Audit record

Written locally to:

```text
examples/mcp/mcp-coding-agent/.enforra/audit.jsonl
```

For `pnpm demo:openai-style`, audit is at repository root `.enforra/audit.jsonl`.

Each line is a JSON audit event with fields such as `agent`, `tool`, `decision`, `matchedPolicyId`, and redacted `argsRedacted`. See [audit behavior](../audit-behavior.md).

## What this proves

The agent can request filesystem or terminal actions, but your application only runs the tool callback when Enforra returns `allow` or `log_only`. Blocked and approval-required requests do not execute. Enforra does not run shell commands or file I/O itself.

## Core model

```text
Agent requests action → Enforra evaluates policy → allow | block | require_approval | log_only
→ Caller executes only on allow or log_only → Decision written to local audit
```

OSS `require_approval` means your app pauses and handles approval. It is not a hosted approval workflow.
