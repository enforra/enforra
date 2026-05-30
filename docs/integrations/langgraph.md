# LangGraph Integration Example

This doc shows how to use Enforra to enforce policies on tools executed within a LangGraph `StateGraph` tool node.

## What This Example Shows

A LangGraph graph routes execution through a prebuilt `ToolNode` that calls the registered tools. Enforra wraps the tool function body so that policy is evaluated **before** the side-effect callback runs. The graph operates entirely locally and routes as usual based on the results.

## Install

```bash
pip install enforra langchain-core langgraph
```

## Where Enforra Sits

```
LangGraph Graph → ToolNode → Tool Function → Enforra evaluates policy → Tool Callback (if allowed)
```

## Example Code

```python
from typing import Annotated
from typing_extensions import TypedDict
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from enforra import EnforraClient

# Initialize Enforra client
client = EnforraClient(
    policy_path="policy.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="coding-agent",
)

# Define actual LangChain / LangGraph tool wrapped with Enforra
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
    return {
        "decision": result.decision,
        "executed": result.executed,
        "status": result.status,
        "reason": result.reason,
    }

class State(TypedDict):
    messages: Annotated[list, add_messages]

# Set up the ToolNode containing the wrapped tools
tool_node = ToolNode([read_file])

# Build the StateGraph
workflow = StateGraph(State)
workflow.add_node("tools", tool_node)
workflow.add_edge(START, "tools")
workflow.add_edge("tools", END)
graph = workflow.compile()
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
