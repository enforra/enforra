# Architecture

Enforra is a local runtime policy layer for agent tool calls. It sits inside your application between agent intent and tool side effects.

## Where Enforra sits

Your application still owns model prompting, tool registration, and real tool callbacks. Enforra only evaluates policy and decides whether the callback should run.

```text
Agent proposes tool call
↓
Enforra evaluates policy
↓
allow | block | require_approval | log_only
↓
execute callback only when allowed
↓
write local audit log
```

## Tool-call lifecycle

1. Your app receives or constructs a proposed tool call.
2. Your app calls `enforceToolCall` with agent name, tool name, args, optional context, and an `execute` callback.
3. Enforra evaluates the loaded YAML policy.
4. Enforra returns one decision:
   - `allow`: callback may run.
   - `log_only`: callback may run, but event is still explicitly logged.
   - `block`: callback must not run.
   - `require_approval`: callback must not run in OSS runtime.
5. Enforra writes audit evidence locally with redacted inputs.

## Before execution

For `allow` and `log_only`, Enforra writes a pre-execution decision event before it invokes `execute`. This is intentional:

- it provides evidence that a policy check happened before side effects,
- it fails closed if audit write fails,
- it preserves a local timeline of intent and policy decision.

## After execution

When callback execution is allowed, Enforra writes a final event indicating outcome (`executed`/`logged`) and captures any error message in redacted form.

For `block` and `require_approval`, callback execution does not happen and Enforra logs non-execution outcomes.

## Failure behavior

- Policy load/parse/validation errors fail the call.
- Audit write failures before allowed execution fail closed and prevent callback execution.
- Callback exceptions are surfaced to the caller and logged with redaction.

## Local boundary and data handling

What runs locally:

- policy loading and evaluation,
- execution gating (`execute` called only for `allow` / `log_only`),
- JSONL audit logging with redaction.

What never leaves the application through Enforra OSS core:

- tool args/context payloads to hosted Enforra services,
- remote tool execution,
- hosted approval orchestration.

The customer app owns real side effects because only the customer app has the actual tool credentials, integration logic, and business context. Enforra is the local guardrail at that boundary.

## Fail-closed decisions

`block` and `require_approval` are fail-closed in OSS runtime: they never execute the callback. This guarantees that uncertain or denied actions do not create side effects by default.
