# LangGraph Integration

This doc shows how to use Enforra to enforce policies on tool functions that are defined using the LangChain/LangGraph tool abstraction.

## What This Integration Shows

A LangGraph graph calls tool functions at nodes. Enforra wraps the tool function body so that policy is evaluated **before** the side-effect callback runs. The graph continues to plan and route as usual.

## Install

```bash
pip install enforra langchain-core
```

## Where Enforra Sits

```
LangGraph Graph → Tool Node → Enforra evaluates policy → Tool callback (if allowed)
```

## Example Code

```python
from langchain_core.tools import tool
from enforra import EnforraClient

client = EnforraClient(
    policy_path="policy.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="coding-agent",
)

# This tool would be registered and called from a LangGraph tool node
@tool
def read_file(path: str) -> dict:
    """Read a file from the filesystem.

    Args:
        path: Path to the file to read.
    """
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": path},
        handler=lambda: {"content": "# main application code"},
    )
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}
```

## Run the Example

```bash
python examples/integrations/langgraph-python/example.py
```

## Expected Output

- Safe file read → **allow**, executed
- `.env` file read → **block**, not executed
- Terminal command → **require_approval**, not executed
- Small refund → **allow**, executed
- Large refund → **block**, not executed

## Audit Log

Written to `examples/integrations/langgraph-python/.enforra/audit.jsonl`.

## Policy Testing

```bash
npx @enforra/cli test --policy examples/integrations/langgraph-python/policy.yaml --cases policy-cases.yaml
```

## What Is Not Included

- Real LangGraph dependency or graph execution
- LLM provider API keys
- Network calls

See the [example directory](../../examples/integrations/langgraph-python/) for full runnable code.
