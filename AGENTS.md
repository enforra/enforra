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

- [packages/policy-core](packages/policy-core): Policy loading, schema validation, and rule evaluation.
- [packages/local-audit](packages/local-audit): Local JSONL audit logs, redaction rules, and hash-chain integrity verification.
- [packages/sdk-node](packages/sdk-node): Node.js enforcement wrapper for tool calls.
- [packages/sdk-python](packages/sdk-python): Python SDK, published to PyPI as `enforra`.
- [packages/mcp](packages/mcp): Model Context Protocol (MCP) style tool handler wrapper.
- [packages/cli](packages/cli): Local command line interface (`enforra` command).
- [packages/policy-simulator](packages/policy-simulator): CLI/runtime utility for simulating policy test cases.
- [examples/](examples/): Runnable demos and code patterns only.
- [docs/](docs/): User-facing documentation.

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

Run these checks and ensure they are staged/committed before submitting:

```bash
pnpm format
pnpm verify:oss
```

> [!IMPORTANT]
> Run `pnpm format` _before_ running `git commit` to ensure formatting changes in TS/JS/Markdown/YAML files are staged and committed.

## Testing requirements

Tests are not optional. Every change to policy behavior, SDK execution semantics, audit behavior, redaction logic, or MCP wrapping must include tests. Agents must not submit a PR with untested logic.

### Test file structure

Each class or module must have its own dedicated test file. Do not consolidate unrelated tests.

- `packages/policy-core/src/evaluator.ts` → `packages/policy-core/src/__tests__/evaluator.test.ts`
- `packages/local-audit/src/redactor.ts` → `packages/local-audit/src/__tests__/redactor.test.ts`
- `packages/sdk-node/src/enforce.ts` → `packages/sdk-node/src/__tests__/enforce.test.ts`
- Python: `packages/sdk-python/enforra/enforce.py` → `packages/sdk-python/tests/test_enforce.py`

One file per class. One `describe` block per class or function group.

### Required coverage per test file

For every function, method, or condition changed or added, tests must cover:

| Category                | What to test                                                  |
| ----------------------- | ------------------------------------------------------------- |
| Positive / happy path   | Valid input, expected output, correct decision returned       |
| Negative / failure path | Invalid input, missing fields, wrong types, bad policy config |
| Edge cases              | Empty string, null, undefined, empty array, empty object      |
| Boundary values         | Min value, max value, one below min, one above max            |
| Every branch            | Every if, else, switch case, ternary, and early return        |
| Every decision outcome  | allow, block, require_approval, log_only must each be tested  |
| Error propagation       | Thrown errors, rejected promises, and error messages          |

Do not write tests only for the happy path. If a function has 4 branches, there must be at least 4 test cases for it.

### Policy evaluation tests (policy-core)

Every policy rule change must include tests for:

- A call that matches the rule and gets the expected decision.
- A call that does not match and falls through to the next rule or default.
- A call with missing or malformed arguments (null, undefined, wrong type).
- A call that hits the minimum and maximum allowed argument values if bounded.
- A call where multiple rules could match and the correct precedence is applied.
- A call against an empty policy (no rules).
- A call against a policy with only a default action.

### Audit / redaction tests (local-audit)

- Confirm fields containing token, secret, api_key, password, private_key are redacted.
- Confirm fields that should not be redacted are not.
- Confirm hash-chain integrity is preserved across sequential log writes.
- Confirm an empty log and a single-entry log both verify correctly.
- Confirm a tampered log entry fails verification.
- Confirm redaction does not alter non-sensitive sibling fields.

### SDK enforcement tests (sdk-node, sdk-python)

- allow decision: execute callback is called, result is returned.
- block decision: execute callback is not called, error or rejection returned.
- require_approval decision: execute callback is not called until approval is granted.
- log_only decision: execute callback is called, audit entry is written.
- Missing policy: behavior is defined and tested (fail open or fail closed, document which).
- Tool call with no arguments: does not crash, decision is deterministic.
- Tool call with maximum argument payload size.
- Tool call with deeply nested argument object.
- Concurrent tool calls: no race condition in audit writes or policy evaluation.

### MCP wrapper tests (packages/mcp)

- Wrapping a tool that returns successfully passes result through unchanged.
- Wrapping a tool that is blocked does not invoke the underlying handler.
- Wrapping a tool with an invalid schema returns a clear error.
- Metadata in the wrapped tool matches the original tool definition.

### CLI tests (packages/cli)

- `enforra init` creates expected output files.
- `enforra test` runs policy simulator and returns correct exit code.
- Invalid subcommand returns a non-zero exit code with a useful message.
- Missing config file returns a clear error, not a crash.

### Running tests

TypeScript packages:

```bash
pnpm test
```

Single package:

```bash
cd packages/policy-core && pnpm test
cd packages/sdk-node && pnpm test
cd packages/local-audit && pnpm test
```

Python SDK:

```bash
cd packages/sdk-python
python3 -m pip install -e ".[dev]"
python3 -m pytest -v
```

Policy simulator:

```bash
pnpm policy:test:all
```

### Test quality rules

- Test names must describe the scenario, not the implementation. Use: "blocks tool call when policy decision is block" not "test block case".
- Do not use `any` in test assertions.
- Do not mock the policy evaluator in SDK tests — use real policy fixtures.
- Do not test implementation details. Test inputs, outputs, and side effects.
- If a bug is fixed, a regression test for that exact scenario is required in the same PR.
- Tests must pass with no skipped cases before a PR is submitted.

## Code quality and architecture rules

Agents must keep Enforra code simple, modular, and reviewable.

Core rules:

- Prefer small focused modules over large files or large classes.
- Follow SOLID principles where practical, especially single responsibility and dependency inversion.
- Do not create god classes, large procedural blocks, or long files that mix parsing, evaluation, IO, logging, and CLI behavior.
- Keep policy evaluation logic data driven where possible. Avoid hardcoded chains of special case rules.
- Do not hardcode product behavior, security decisions, tool names, package names, or severity mappings unless they are explicitly part of a documented policy, schema, or constant.
- If a rule, decision, severity, or mapping can be represented as policy config, schema, fixture, or test case, prefer that over hardcoded logic.
- Keep business logic separate from CLI formatting, file IO, audit writing, and demo code.
- Prefer pure functions for policy evaluation, classification, redaction, and drift comparison.
- Add or update tests when changing policy behavior, audit behavior, drift behavior, SDK execution semantics, or MCP wrapping behavior.
- Do not make broad rewrites unless the task explicitly asks for refactoring.
- If code starts becoming complex, split it into named helpers with clear inputs and outputs.

Avoid:

- Large classes with many responsibilities.
- Long `if/else` or `switch` blocks for policy behavior.
- Hardcoded demo-specific logic inside reusable packages.
- Hidden defaults that change enforcement semantics.
- Duplicated rule logic across packages.
- Adding abstractions before there are at least two real use cases.

Preferred pattern:

1. Parse or load input.
2. Validate against schema.
3. Normalize into typed internal structures.
4. Evaluate with small pure functions.
5. Return explicit decisions.
6. Keep logging, CLI output, and file writes outside the core evaluator.

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

1. **files changed** using repository-relative paths
2. **behavior changed**
3. **commands run**
4. **verification results**
5. **security/dependency notes**
6. **generated files cleaned**
7. **final git status**
8. **whether ready for PR**
