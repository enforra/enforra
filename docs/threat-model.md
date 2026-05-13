# Threat Model

This document describes the trust boundary for the Enforra open source runtime core.

Enforra OSS is a local action governance SDK. It evaluates policy before an application-owned tool callback runs. It does not execute tools remotely, call a hosted API, detect prompt injection, proxy MCP traffic, sandbox the operating system, or provide hosted approval workflows.

## What Enforra Protects

Enforra protects the application boundary immediately before an AI agent tool call becomes a real side effect.

It is designed to help applications:

- evaluate local policy before tool callbacks run
- block tool calls that should not execute
- mark risky tool calls as requiring approval
- log local audit evidence for policy decisions and execution status
- fail closed for blocked and approval-required actions
- avoid writing raw common secret fields to local audit logs

## What Enforra Does Not Protect

Enforra OSS does not protect against every agent security risk.

It does not provide:

- MCP gateway or proxy behavior
- kernel enforcement or process sandboxing
- taint tracking or data-flow analysis
- prompt-injection detection
- model firewall behavior
- hosted approvals
- hosted audit retention
- authentication, billing, RBAC, SSO, or dashboard behavior
- service connectors or credential vaulting
- compliance coverage guarantees
- tamper-proof audit storage

## Trust Boundaries

The primary trust boundary is the SDK call to `enforceToolCall`.

Inside the boundary:

- policy is loaded from a local YAML file
- the policy engine evaluates `agent`, `tool`, `args`, and optional `context`
- the SDK decides whether to call the application-provided `execute` callback
- local audit events are written through `@enforra/local-audit`

Outside the boundary:

- the AI agent chooses or proposes tool calls
- the application owns the actual tool implementation
- the application owns secrets and credentials needed by tools
- the application owns any approval workflow after `require_approval`
- the local filesystem and audit file are controlled by the host environment

## Attacker Assumptions

Enforra assumes an AI agent may be manipulated, confused, or instructed to call tools unexpectedly.

Examples:

- a prompt injection asks the agent to send external email
- a model hallucination creates an unsafe refund amount
- a malicious document asks the agent to export data
- an agent attempts to run a shell command in production

Enforra does not try to identify the prompt injection itself. It evaluates the resulting tool call against local policy before the callback runs.

## Application Responsibilities

The application is responsible for:

- routing every risky tool call through `enforceToolCall`
- providing accurate `agent`, `tool`, `args`, and `context` values
- keeping tool secrets out of policy files and logs
- implementing the actual tool callback safely
- handling `require_approval` results without executing the callback
- handling failed or audit-failed results without unsafe retries
- protecting local policy and audit files with normal filesystem controls

If a tool call bypasses Enforra and invokes the tool directly, Enforra cannot enforce policy for that call.

## Policy File Trust Assumptions

Policy files are trusted local configuration.

Enforra validates policy shape with Zod, but it assumes the policy file path provided by the developer is the intended policy. If an attacker can modify the policy file, they may be able to weaken enforcement.

Recommended controls:

- store policy files with source control review
- restrict write access in production
- use fail-closed defaults
- keep sensitive values out of policy files
- test policy behavior for risky tools

## Local Audit File Trust Assumptions

Audit logs are written to a local JSONL file, usually `.enforra/audit.jsonl`.

Audit entries are redacted for common secret fields and common secret patterns in error messages. The current OSS audit log is not tamper-evident. A local user or process with write access to the audit file can modify or delete it.

Recommended controls:

- write audit logs to a location with restricted permissions
- ship logs to your own append-only or centralized logging system if needed
- treat local audit logs as local evidence, not immutable compliance records

## If an Agent Is Manipulated

If an agent is manipulated into requesting a risky tool call, Enforra still evaluates the tool call before the callback runs.

Policy can:

- allow known safe actions
- block dangerous actions
- mark risky actions as requiring approval
- log actions without blocking when using `log_only`

The runtime does not inspect the original prompt or determine whether manipulation occurred.

## If a Tool Callback Throws

For `allow` and `log_only`, Enforra calls the `execute` callback after the pre-execution decision audit event is written.

If the callback throws:

- the tool is considered `executed: true` because the callback was entered
- the SDK returns `ok: false`
- the original `Error` object is returned to the caller
- the audit log records status `failed`
- the error message written to audit is redacted

If writing the failed audit event also fails, the SDK preserves the original execution error and returns `auditFailed: true`.

## If Audit Logging Fails

Audit failure behavior depends on when the failure happens.

For `block`:

- the callback is not executed
- the SDK returns `blocked: true`
- if the blocked audit event fails, the result includes `auditFailed: true`

For `require_approval`:

- the callback is not executed
- the SDK returns `approvalRequired: true`
- if the pending approval audit event fails, the result includes `auditFailed: true`

For `allow` and `log_only` before execution:

- the SDK first writes a `decision_logged` audit event
- if that write fails, the callback is not executed
- the result includes `auditFailed: true`

For `allow` and `log_only` after successful execution:

- the callback has already run
- the SDK attempts to write `executed` or `logged`
- if that write fails, the result includes `executed: true`, `auditFailed: true`, and the callback data

This avoids hiding a successful side effect and helps callers avoid accidental retries.

## Why Block and Require Approval Fail Closed

`block` and `require_approval` never call `execute`.

This is intentional:

- `block` means policy denied the action
- `require_approval` means the local OSS runtime reached an approval boundary
- the OSS runtime does not provide a hosted approval workflow

The application can route `require_approval` results into its own approval process. Until that happens, the tool callback does not run.

## Why Allow and Log Only Write Pre-Execution Audit First

For `allow` and `log_only`, the SDK writes a `decision_logged` audit event before the callback runs.

This creates local evidence that policy allowed execution before the side effect occurred. If the pre-execution audit write fails, Enforra does not run the callback.

Successful executed calls may create more than one audit event:

- `decision_logged` before callback execution
- `executed`, `logged`, or `failed` after callback execution

## Data That Never Leaves the Process by Default

By default, Enforra OSS does not send data over the network.

The following stay local to the process and filesystem unless the application sends them elsewhere:

- policy files
- tool call args
- context values
- decisions
- audit events
- execution errors
- callback return data

The runtime performs no telemetry, analytics, hosted API calls, database writes, or hidden background work.

## Tamper Resistance Limitations

Local audit logs are redacted but not tamper-evident yet.

Current limitations:

- no hash chain
- no HMAC signatures
- no remote retention
- no append-only storage guarantee
- no built-in log shipping

Optional tamper-evident local audit mode is a possible future improvement, but it is not implemented in the current OSS runtime.
