# Quality Gates

This document outlines the repository quality gates and standards that every Pull Request must meet before merging to `main`.

---

## Overview

To maintain code health, security, and performance across Enforra, we enforce quality gates tailored to the risk level of the changes. The gates are categorized into four tiers based on scope:

| Tier       | Change Type                           | Verification Requirements                                                               |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| **Tier 1** | Docs-only                             | Prettier format check.                                                                  |
| **Tier 2** | Examples / Demos                      | Prettier format, build, execution of affected examples.                                 |
| **Tier 3** | SDK / MCP / Runtime / Core            | Full test suites (Node and Python), performance benchmarks, strict security check.      |
| **Tier 4** | High-Risk Runtime / Release Candidate | Full test suites, benchmark checks, local soak loops, memory and corruption inspection. |

---

## Required Checks for All PRs

All PRs must pass the baseline workspace checks:

1. **Formatting**: Ensure files match style guidelines.
   ```bash
   pnpm format
   ```
2. **Build and Node Tests**: Validate workspace compilation, lint rules, and Node.js unit tests.
   ```bash
   pnpm verify:oss
   ```

---

## Extra Checks for Python Changes

If changes touch the Python SDK (`packages/sdk-python`), Python examples, or associated Python documents:

1. Install the SDK package in editable mode with development dependencies.
2. Run pytest suite.
   ```bash
   cd packages/sdk-python
   python3 -m pip install -e ".[dev]"
   python3 -m pytest
   cd ../..
   ```

---

## Extra Checks for SDK/Runtime Changes

For modifications inside core packages (`packages/policy-core`, `packages/local-audit`, `packages/sdk-node`, `packages/policy-simulator`):

1. **Unit Testing**: Run vitest unit suites under respective packages.
2. **Backward Compatibility**: Ensure existing starter policies and log formatting remain compatible.
3. **Redaction**: Verify that redaction rules continue to properly shield sensitive information.

---

## Extra Checks for MCP Changes

For modifications inside the `@enforra/mcp` package or MCP-style examples:

1. Run MCP package tests:
   ```bash
   pnpm --filter @enforra/mcp test
   ```
2. Execute the MCP tool guard demos to check for errors:
   ```bash
   pnpm demo:mcp-guard
   ```

---

## Extra Checks for Examples/Docs Changes

When moving, adding, or modifying examples:

1. **Links Integrity**: Verify no broken links are introduced in documentation (`docs/*.md`, `README.md`, `examples/README.md`).
2. **Runnable Demos**: Confirm the example is runnable without requiring external API keys (unless explicitly documented).
3. **Workspace registration**: If a new folder is created, check that it is correctly configured under workspaces in `pnpm-workspace.yaml`.

---

## Security Checks

Every PR is reviewed against the following security checklist:

- **No Raw Secrets**: No hardcoded API keys, tokens, passwords, or credentials.
- **No Machine-Specific Paths**: No local absolute paths like `file:///Users/...`.
- **TypeScript & Lint Escapes**: No unjustified `as any` casting or `eslint-disable` comments.
- **Data Protection**: Ensure redaction filters are applied to sensitive fields containing `token`, `secret`, `api_key`, `password`, or `private_key` in local audit trails.
- **Local Isolation**: Verify no telemetry or unauthorized external calls are introduced to the core runtime.

Run these security scans to verify cleanliness:

```bash
grep -rn "file:///Users" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.venv || true
grep -rn " as any" . --include="*.ts" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist || true
grep -rn "eslint-disable" . --include="*.ts" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist || true
```

---

## Dependency Checks

To keep the repository footprint light:

- Do not add workspace dependencies unless strictly necessary.
- Framework dependencies (such as `langgraph`, `ai`, etc.) must remain isolated within their respective `examples/` subfolders.
- Avoid introducing heavy dependencies to the root workspace.
- Document and justify any package configuration updates in your PR description.

---

## Performance, Load, and Soak Checks

Performance checks are required for Tier 3 and Tier 4 changes:

1. **Benchmark**: Run policy evaluation benchmarks to confirm there is no degradation in latency or throughput.
   ```bash
   pnpm benchmark:policy
   ```
2. **Soak / Loop Testing (Tier 4 only)**: Run a local shell loop of the demo scenario to verify memory usage stays flat and no local logs get corrupted.
   ```bash
   for i in {1..20}; do pnpm demo:support-refund >/tmp/enforra-demo.log || exit 1; done
   ```

---

## Merge Readiness Checklist

Before marking your PR as ready for review, check off the following items:

- [ ] Code is formatted and compiles cleanly.
- [ ] Automated tests for modified features are included and pass.
- [ ] Examples and documentation reflect any modifications made.
- [ ] No private secrets or local absolute paths are committed.
- [ ] Any new dependencies are documented.
- [ ] Generated local log/test files are cleaned up (`rm -rf .enforra`).
