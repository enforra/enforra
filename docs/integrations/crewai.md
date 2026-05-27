# CrewAI Integration Pattern

This doc shows how to use Enforra to enforce policies on CrewAI-style custom tool functions.

## What This Pattern Shows

CrewAI custom tools implement a `_run` method that performs the tool action. Enforra wraps the tool function body so that policy is evaluated **before** the side-effect callback runs. The crew continues to plan and assign tasks as usual.

## Install

```bash
pip install enforra
```

## Where Enforra Sits

```
CrewAI Crew → Agent calls custom tool → Enforra evaluates policy → Tool _run body (if allowed)
```

## Example Code

```python
from enforra import EnforraClient

client = EnforraClient(
    policy_path="policy.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="coding-agent",
)

# This would be inside a CrewAI custom tool _run method
def write_file(path: str, content: str) -> dict:
    result = client.run_tool(
        tool_name="filesystem.write",
        args={"path": path, "content": content},
        handler=lambda: {"written": True},
    )
    return {"decision": result.decision, "executed": result.executed}
```

## Run the Example

```bash
python examples/integrations/crewai-python/example.py
```

## Expected Output

- Safe file read → **allow**, executed
- File write → **require_approval**, not executed
- Small refund → **allow**, executed
- Large refund → **block**, not executed

## Audit Log

Written to `examples/integrations/crewai-python/.enforra/audit.jsonl`.

## What Is Not Included

- Real CrewAI dependency or crew execution
- LLM provider API keys
- Network calls

See the [example directory](../examples/integrations/crewai-python/) for full runnable code.
