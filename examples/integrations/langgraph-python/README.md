# LangGraph Integration Pattern

LangGraph-style tool wrapper pattern showing Enforra policy enforcement before tool execution.

This example does not require LangGraph, an LLM provider, or API keys. It demonstrates the integration pattern: Enforra wraps the tool function that would be called from a LangGraph tool node.

## Install

```bash
pip install enforra
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
