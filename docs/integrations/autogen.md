# AutoGen Integration Pattern

This doc shows how to use Enforra to enforce policies on AutoGen-style function tools.

## What This Pattern Shows

AutoGen registers Python functions as tools for agents. Enforra wraps the function body so that policy is evaluated **before** the side-effect callback runs. The agent continues to call functions as usual.

## Install

```bash
pip install enforra
```

## Where Enforra Sits

```
AutoGen Agent → Calls function tool → Enforra evaluates policy → Function body (if allowed)
```

## Example Code

```python
from enforra import EnforraClient

client = EnforraClient(
    policy_path="policy.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="coding-agent",
)

# This would be registered as an AutoGen function tool
def run_terminal(command: str) -> dict:
    result = client.run_tool(
        tool_name="terminal.run",
        args={"command": command},
        handler=lambda: {"exit_code": 0, "stdout": "ok"},
    )
    return {"decision": result.decision, "executed": result.executed}
```

## Run the Example

```bash
python examples/integrations/autogen-python/example.py
```

## Expected Output

- Safe file read → **allow**, executed
- Private key file read → **block**, not executed
- Terminal command → **require_approval**, not executed

## Audit Log

Written to `examples/integrations/autogen-python/.enforra/audit.jsonl`.

## What Is Not Included

- Real AutoGen dependency or agent execution
- LLM provider API keys
- Network calls

See the [example directory](../../examples/integrations/autogen-python/) for full runnable code.
