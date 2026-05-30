# LangGraph Integration Example

Real package integration using the actual `langchain-core` library to wrap tools with Enforra policies.

This example runs entirely locally, requires no LLM provider, and requires no API keys. It uses the real `langchain-core` tool definition and shows Enforra evaluating policy inside the tool's execution callback.

## Install

```bash
pip install enforra langchain-core
```

## Run

```bash
python examples/integrations/langgraph-python/example.py
```

## Expected Output

```
--- Tool: filesystem.read ---
Args: {'path': '/workspace/src/main.py'}
Decision: allow
Executed: yes

--- Tool: filesystem.read ---
Args: {'path': '/workspace/.env'}
Decision: block
Executed: no

--- Tool: terminal.run ---
Args: {'command': 'npm install express'}
Decision: require_approval
Executed: no

--- Tool: support.refund ---
Args: {'amount': 25}
Decision: allow
Executed: yes

--- Tool: support.refund ---
Args: {'amount': 500}
Decision: block
Executed: no
```

## Audit Log

Written to `examples/integrations/langgraph-python/.enforra/audit.jsonl`.

## What This Shows

- A safe file read is **allowed** and executes
- Reading `.env` is **blocked** by policy
- Running a terminal command **requires approval**
- A small refund is **allowed**
- A large refund is **blocked** (no matching allow policy, default is block)

## What Is Not Included

- Real LangGraph dependency or graph execution
- LLM provider API keys
- Network calls
