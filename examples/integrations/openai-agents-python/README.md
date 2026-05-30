# OpenAI Agents SDK Integration Example

Real package integration using the actual `openai-agents` SDK to register function tools wrapped with Enforra policies.

This example runs entirely locally, requires no OpenAI API key, and requires no network calls. It uses the real `openai-agents` decorator to define a tool and shows Enforra evaluating policy inside the tool's execution callback.

## Install

```bash
pip install enforra openai-agents
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
