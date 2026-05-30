# PR Review Policy

To maintain Enforra's engineering standards, safety parameters, and OSS principles, every Pull Request (PR) goes through three distinct validation and review layers.

---

## The Three Review Layers

1. **Automated CI Checks (Blocking)**
   - Lint check, code style formatting, type checks, and complete unit/integration test execution.
   - Any CI failure strictly blocks merging to the `main` branch.

2. **AI-Assisted Review (Advisory)**
   - Reviews by AI tools such as:
     - GitHub Copilot code review
     - Codex code review
     - CodeRabbit
     - Qodo
   - These tools provide advisory feedback to detect edge cases, potential performance bottlenecks, and security oversights. AI checks are supportive and do not replace human or CI verification.

3. **Human Maintainer Review (Final Approval)**
   - Review from core repository maintainers.
   - Human approvals are required for all package changes, runtime/security-sensitive modifications, and dependency configuration updates.

---

## Review Rules

- **Advisory AI**: AI review recommendations are strictly advisory and do not bypass required checks.
- **CI Enforcement**: Passing status checks is mandatory for all code merges.
- **Human Authority**: Human maintainers hold final authority on merge decisions.
- **Security Scrutiny**: Runtime core edits and security-related files (audit trails, policy parser, client logic) require meticulous review.
- **Dependency Control**: Any new dependency must be thoroughly explained and justified.
- **Local-First Mandate**: The public OSS core runtime must always remain local-first, with no telemetry or external network calls.

---

## Recommended GitHub Settings

The following settings are configured manually in repository administration:

- **Protect main**: Prevent force pushes and deletion of the main branch.
- **Require PR before merge**: Enforce all code edits to be introduced via pull requests.
- **Require approving reviews**: Require at least 1 approving review from human maintainers.
- **Require status checks to pass**: Require CI build, lint, and test suites to complete successfully before merging.
- **Require branches to be up-to-date**: Ensure PR branches are rebased/merged with the latest changes on main before merging.
- **Require conversation resolution**: Require all review comments to be resolved or closed.
- **Require review from CODEOWNERS**: Enforce code review from the designated CODEOWNERS when modifications affect core files.
