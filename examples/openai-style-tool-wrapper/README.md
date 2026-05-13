# OpenAI-Style Tool Wrapper Example

This example shows the wrapper pattern for applying Enforra before application tool callbacks proposed by a model.

No external API calls are made. The tool callbacks return local mock results.

## Policy Used

```text
policies/starter/openai-style-agent.yaml
```

The example evaluates three mock model-proposed tool calls:

```text
agent: coding-agent
tool: repo.search

agent: coding-agent
tool: email.send

agent: coding-agent
tool: customer.export
```

The starter policy allows repository search, marks external email as requiring approval, and blocks production customer export.

## Run

```bash
pnpm demo:openai-style
```

## Expected Output

```text
Enforra OpenAI-style tool wrapper demo

Tool call: repo.search
Agent: coding-agent
Decision: allow
Executed: yes

Tool call: email.send
Agent: coding-agent
Decision: require_approval
Executed: no
Reason: matched policy approve-external-email

Tool call: customer.export
Agent: coding-agent
Decision: block
Executed: no
Reason: matched policy block-production-export

Audit log written to .enforra/audit.jsonl
```

## Why Each Decision Happens

- `repo.search` matches `allow-repo-search`, so the callback executes.
- `email.send` to `external@example.com` matches `approve-external-email`, so the callback does not execute.
- `customer.export` in production matches `block-production-export`, so the callback does not execute.

The callbacks are local mocks only.

## What Should and Should Not Execute

Only the `allow` call should execute.

The `require_approval` and `block` calls should not execute.

## Audit Logs

Audit logs are written to:

```text
.enforra/audit.jsonl
```

The allowed call writes `decision_logged` and `executed`. The approval-required and blocked calls write `pending_approval` and `blocked`.
