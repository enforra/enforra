# AutoGen Integration Pattern

AutoGen-style function tool pattern showing Enforra policy enforcement before tool execution.

This example does not require AutoGen, an LLM provider, or API keys. It demonstrates the integration pattern: Enforra wraps the function that would be registered as an AutoGen function tool.

## Install

```bash
pip install enforra
```

## Run

```bash
python examples/integrations/autogen-python/example.py
```

## Expected Output

```
--- Tool: filesystem.read ---
Decision: allow
Executed: yes

--- Tool: filesystem.read ---
Decision: block
Executed: no

--- Tool: terminal.run ---
Decision: require_approval
Executed: no
```

## Audit Log

Written to `examples/integrations/autogen-python/.enforra/audit.jsonl`.

## What This Shows

- A safe file read is **allowed**
- Reading a private key file is **blocked**
- Running a terminal command **requires approval**

## What Is Not Included

- Real AutoGen dependency or agent execution
- LLM provider API keys
- Network calls
