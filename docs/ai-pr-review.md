# AI-Assisted Pull Request Review

This document explains the integration, role, and guidelines for AI-assisted code reviews within the Enforra repository.

---

## Role of AI Review

To support contributors and human reviewers, we use **CodeRabbit** as the default AI PR reviewer.

- **AI Review is Advisory**: CodeRabbit comments are recommendations. They do not block pull requests or request changes automatically.
- **CI is Blocking**: Code validation checks (lint, formatting, type checking, test runs) are enforced in GitHub Actions. Passing CI is a mandatory gateway.
- **Human maintainer approval is required**: All code changes must be approved by a repository CODEOWNER before merging. AI review does not replace human approval.
- **Meticulous manual reviews**: Maintainers must manually audit any runtime core changes and security-related files (audit trails, redaction rules, policy evaluations).

---

## Configuration

Our review parameters are defined in [.coderabbit.yaml](../.coderabbit.yaml). These settings customize CodeRabbit to:

- Review code changes automatically for standard PRs.
- Avoid automatic reviews for Draft PRs.
- Avoid requesting changes or blocking PRs (disabled `request_changes_workflow`).
- Follow Enforra-specific path instructions for security redactions, local-first runtime core code, and example dependencies.

---

## Manual GitHub App Integration

To enable CodeRabbit reviews on this repository:

1. Install the **CodeRabbit** app from the GitHub Marketplace.
2. Select the **enforra/enforra** repository under the configuration scope.
3. CodeRabbit will automatically pick up [.coderabbit.yaml](../.coderabbit.yaml) from the default branch.

---

## Other AI Reviewers

While tools like GitHub Copilot Code Review, Codex, and Qodo are supported for developer local workflows, we default to **CodeRabbit** for automated PR review threads in order to prevent redundant comments on pull request logs.
