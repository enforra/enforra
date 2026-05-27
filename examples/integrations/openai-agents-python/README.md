# OpenAI Agents SDK Integration Pattern

OpenAI Agents SDK-style tool wrapper pattern showing Enforra policy enforcement before tool execution.

This example does not require the OpenAI Agents SDK, an OpenAI API key, or any network calls. It demonstrates the integration pattern: Enforra wraps the tool function that would be registered with the Agents SDK.

## Install

```bash
pip install enforra
```

## Run

```bash
python examples/integrations/openai-agents-python/example.py
```

## Expected Output

```
--- Tool: filesystem.read ---
Decision: allow
Executed: yes

--- Tool: filesystem.read ---
Decision: block
Executed: no

--- Tool: github.create_issue ---
Decision: require_approval
Executed: no

--- Tool: support.refund ---
Decision: allow
Executed: yes
```

## Audit Log

Written to `examples/integrations/openai-agents-python/.enforra/audit.jsonl`.

## What This Shows

- A safe file read is **allowed**
- Reading `.env` is **blocked** by policy
- Creating a GitHub issue **requires approval**
- A small refund is **allowed**

## What Is Not Included

- Real OpenAI Agents SDK dependency
- OpenAI API keys
- Network calls or model execution
