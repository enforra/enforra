# OpenAI-Style Tool Wrapper Example

This example shows the wrapper pattern for applying Enforra before an application tool callback runs.

No external API calls are made. The tool callback returns a local fake repository search result.

## Policy Used

```text
policies/starter/coding-agent.yaml
```

The example calls:

```text
agent: coding-agent
tool: repo.search
```

The starter policy allows repository search for `coding-agent`.

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

Audit log written to .enforra/audit.jsonl
```

## Why the Decision Happens

`repo.search` matches `allow-repo-search` in `policies/starter/coding-agent.yaml`, so Enforra allows execution.

The fake repository search callback executes and returns local mock data.

## What Should and Should Not Execute

The application callback should execute only after Enforra returns `allow`.

If the policy returned `block` or `require_approval`, the callback would not run.

## Audit Logs

Audit logs are written to:

```text
.enforra/audit.jsonl
```

The demo writes a pre-execution `decision_logged` event and a final `executed` event.
