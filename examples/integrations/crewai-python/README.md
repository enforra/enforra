# CrewAI Integration Pattern

CrewAI-style custom tool pattern showing Enforra policy enforcement before tool execution.

This example does not require CrewAI, an LLM provider, or API keys. It demonstrates the integration pattern: Enforra wraps the tool function that would be called from a CrewAI custom tool's `_run` method.

## Install

```bash
pip install enforra
```

## Run

```bash
python examples/integrations/crewai-python/example.py
```

## Expected Output

```
--- Tool: filesystem.read ---
Decision: allow
Executed: yes

--- Tool: filesystem.write ---
Decision: require_approval
Executed: no

--- Tool: support.refund ---
Args: {'amount': 15}
Decision: allow
Executed: yes

--- Tool: support.refund ---
Args: {'amount': 999}
Decision: block
Executed: no
```

## Audit Log

Written to `examples/integrations/crewai-python/.enforra/audit.jsonl`.

## What This Shows

- A safe file read is **allowed**
- Writing a file **requires approval**
- A small refund is **allowed**
- A large refund is **blocked**

## What Is Not Included

- Real CrewAI dependency or crew execution
- LLM provider API keys
- Network calls
