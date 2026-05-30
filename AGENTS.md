# AGENTS.md

This guide is for AI coding agents and contributors using agentic coding tools to develop Enforra.

## Enforra engineering doctrine

Core principles:

- **System prompts are not a security boundary**: Enforra is built to govern tools at the programmatic API level.
- **Enforra enforces policy before tool side effects happen**: Enforra intercepts the call before execution occurs.
- **The customer application owns actual tool execution**: Enforra decides whether to allow, block, or require approval, but does not execute the tool itself (except via the provided execute callback on approval).
- **OSS runtime must remain local-first**: The runtime must not require Enforra Cloud.
- **No telemetry/network calls in OSS**: Do not add hosted telemetry, external network calls, or cloud requirements to the open source runtime.
- **Preserve semantics**: Do not weaken allow/block/require_approval/log_only semantics.
- **Do not execute callbacks on block/require_approval**: If policy returns block or require_approval, do not run the execute callback.
- **Do not log secrets**: Redaction must remain conservative.
- **Prefer small, reviewable PRs**.

## Package boundaries

- [packages/policy-core](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/policy-core): Policy loading, schema validation, and rule evaluation.
- [packages/local-audit](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/local-audit): Local JSONL audit logs, redaction rules, and hash-chain integrity verification.
- [packages/sdk-node](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/sdk-node): Node.js enforcement wrapper for tool calls.
- [packages/sdk-python](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/sdk-python): Python SDK, published to PyPI as `enforra`.
- [packages/mcp](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/mcp): Model Context Protocol (MCP) style tool handler wrapper.
- [packages/cli](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/cli): Local command line interface (`enforra` command).
- [packages/policy-simulator](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/packages/policy-simulator): CLI/runtime utility for simulating policy test cases.
- [examples/](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/examples): Runnable demos and code patterns only.
- [docs/](file:///Users/swethavellampalli/Desktop/AI_Projects/enforra_repo/docs): User-facing documentation.

Rules:

- SDK examples should use public packages where possible.
- Do not import internal packages in examples unless necessary.
- Do not add heavy dependencies to the root workspace.
- Keep heavy framework dependencies isolated to their respective example folders.
- Do not add package versions or publish changes unless explicitly asked.

## Required workflow before PR

Agents must:

1. Confirm branch and status.
2. Understand scope.
3. Make minimal changes.
4. Update docs if behavior or paths change.
5. Run required checks.
6. Clean generated files.
7. Report exact commands and results.

### Diagnostics

Run these commands to confirm state:

```bash
git branch --show-current
git status --short
git diff --stat
```

### Base Required Checks

Run these checks before submitting:

```bash
pnpm format
pnpm verify:oss
```

### Python SDK Checks

When Python code, docs, or examples have changed, install and test:

```bash
cd packages/sdk-python
python3 -m pip install -e ".[dev]"
python3 -m pytest
cd ../..
```

### Example and Demo Checks

When examples or starter policies change:

- Run the affected example.
- If integration examples changed, run the affected integration example.
- If MCP examples changed, run the MCP demos.
- If policy cases changed, run simulator policy tests.

Available test and demo commands:

```bash
pnpm demo:support-refund
pnpm demo:mcp-guard
pnpm policy:test:all
pnpm benchmark:policy
```

## Security checklist

- **No secrets committed**: Ensure no API keys, tokens, credentials, or private credentials are in code, test fixtures, or docs.
- **No tokens in docs/logs**: No access tokens should be written to documentation or console logs.
- **No local absolute paths**: Ensure no `file:///Users/...` or machine-specific absolute paths are hardcoded.
- **No `as any` TS shortcuts**: Do not bypass the TypeScript compiler using `as any` unless explicitly justified.
- **No `eslint-disable`**: Do not disable eslint rules unless explicitly justified.
- **No external calls**: No telemetry or external network calls inside the OSS runtime core.
- **Preserve redaction**: Ensure redaction matches for fields containing `token`, `secret`, `api_key`, `password`, or `private_key`.
- **Audit logs**: Audit logs must never contain raw secrets.

### Security Scan Commands

Run these commands to verify code cleanliness (fix unexpected findings, though docs/markdown hits do not block PRs):

```bash
grep -rn "file:///Users" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.venv || true
grep -rn " as any" . --include="*.ts" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist || true
grep -rn "eslint-disable" . --include="*.ts" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist || true
```

## Dependency rules

- Do not add dependencies unless necessary.
- Explain every new dependency in the PR description.
- Keep framework dependencies inside examples when possible.
- Do not add heavy machine learning or framework dependencies to the root workspace.
- For npm package changes, inspect the lockfile changes (`pnpm-lock.yaml`).
- For Python package changes, verify that the build/test still works.
- Do not publish npm or PyPI packages from a normal feature PR.

## Performance, load, and soak expectations

- **Normal PR**:
  - Run `pnpm verify:oss`.
  - Run affected demos/examples.
- **Policy Engine / SDK Hot Path / Audit Writer / MCP changes**:
  - Run `pnpm benchmark:policy`.
  - Include before and after performance results in the PR if performance-relevant.
- **Release Candidate / High-Risk Runtime changes**:
  - Run repeated demo/benchmark loops locally.
  - Document command, duration, and result (confirming no memory growth or audit log corruption).

Example run commands:

```bash
pnpm benchmark:policy
for i in {1..20}; do pnpm demo:support-refund >/tmp/enforra-demo.log || exit 1; done
```

_Note: Soak and load testing is not required for docs-only PRs._

## Docs and examples rules

- Keep the main `README.md` short and high-level.
- Detailed documentation belongs in the `docs/` folder.
- Examples must be fully runnable and require no API keys (unless explicitly documented).
- Pattern-only examples must be clearly labeled as "pattern only".
- Do not overclaim official or certified framework integrations.
- If examples move, update the root `README.md`, `docs/`, `package.json` scripts, CI configurations, and `examples/README.md`.

## Final response format for agents

Every completed agent task should report:

1. **files changed** (with file:/// links)
2. **behavior changed**
3. **commands run**
4. **verification results**
5. **security/dependency notes**
6. **generated files cleaned**
7. **final git status**
8. **whether ready for PR**
