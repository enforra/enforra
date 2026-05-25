# Development

## OSS Verification

### Install

```bash
pnpm install
```

### Normal development checks

```bash
pnpm verify
```

This runs:

1. `pnpm format:check` — check formatting without modifying files
2. `pnpm build` — build all packages and examples
3. `pnpm test` — run all tests
4. `pnpm lint` — run ESLint

### Full OSS verification

```bash
pnpm verify:oss
```

This runs `pnpm verify` and then the demo verification suite:

- `pnpm demo:observe`
- `pnpm demo:mcp-guard`

## Python SDK

Install and test the local Python SDK from the package directory:

```bash
cd packages/sdk-python
python3 -m pip install -e ".[dev]"
python3 -m pytest
```

Run the Python example from the repository root:

```bash
python3 examples/python-support-refund-agent/example.py
python3 examples/python-support-refund-agent/example.py --observe
```

### Demos

```bash
pnpm demo:observe
pnpm demo:mcp-guard
```

For all demos:

```bash
pnpm demo:all
```

---

## Build Fix Protocol

Every build fix must include:

1. **Exact command that failed** — e.g. `pnpm build`, `pnpm -r exec tsc --noEmit`
2. **Exact error message** — copy the full error output
3. **Root cause** — why the error occurred
4. **File changed** — exact file path and what was modified
5. **Why the fix is correct** — explain why this change resolves the error without weakening types
6. **Verification command run after the fix** — show the passing output

---

## Before Committing Checklist

- [ ] Run `pnpm verify:oss` — all steps pass
- [ ] No TypeScript errors — `pnpm build` succeeds
- [ ] No missing workspace dependencies — all `@enforra/*` imports resolve
- [ ] No broad `any` suppressions — avoid file-level disables for explicit `any`
- [ ] No generated `.enforra` files committed — run cleanup:
  ```bash
  rm -rf .enforra && find . -name ".enforra" -type d -prune -exec rm -rf {} +
  ```
- [ ] No local absolute file URLs or user-specific machine paths committed — check with:
  ```bash
  grep -R "<local-absolute-file-url>" -n . || true
  ```
