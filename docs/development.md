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
python3 examples/quickstart/support-refund-python/example.py
python3 examples/quickstart/support-refund-python/example.py --observe
```

### Publishing to TestPyPI / PyPI

To build and prepare the Python SDK for publishing:

1. **Build the distribution packages**:
   Ensure `build` and `twine` are installed, and run the build from `packages/sdk-python`:

   ```bash
   python3 -m build
   python3 -m twine check dist/*
   ```

2. **Publishing via GitHub Actions (Trusted Publishing - Preferred)**:
   Configure PyPI/TestPyPI Trusted Publishing (OIDC) for the `enforra/enforra` repository.
   - Go to PyPI/TestPyPI -> Account Settings -> Publishing and add a new publisher:
     - Owner: `enforra`
     - Repository: `enforra`
     - Workflow name: (e.g., `release.yml` or `publish-python.yml`)
     - Environment name: (e.g., `pypi` or `testpypi`)
   - In the GitHub Actions workflow, use the standard `pypa/gh-action-pypi-publish` action:
     ```yaml
     permissions:
       id-token: write # Required for Trusted Publishing
     steps:
       - name: Publish to TestPyPI
         uses: pypa/gh-action-pypi-publish@release/v1
         with:
           repository-url: https://test.pypi.org/legacy/
     ```

3. **Publishing Manually via API Token (Fallback)**:
   If manual publishing is required, upload using a PyPI / TestPyPI API token:
   ```bash
   # Upload to TestPyPI
   python3 -m twine upload --repository testpypi dist/*
   # Upload to PyPI
   python3 -m twine upload dist/*
   ```
   When prompted, use `__token__` as the username and your generated API token as the password.

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

## Continuous Maintenance

Continuous maintenance and security workflows are automated via GitHub Actions:

- **Dependabot**: Opens weekly PRs for dependency updates (npm/pnpm, GitHub Actions, and Python dependencies).
- **CodeQL**: Periodically scans TypeScript, JavaScript, and Python code for vulnerabilities and security issues.
- **OpenSSF Scorecard**: Reports overall OSS security hygiene and supply chain safety metrics.

> [!IMPORTANT]
> Maintainers should review automated dependency update PRs individually before merging instead of using auto-merge blindly.

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
