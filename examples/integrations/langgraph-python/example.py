"""LangGraph Python Integration Example with Enforra policy enforcement.

This example uses the actual 'langgraph' and 'langchain-core' packages to build
and execute a StateGraph, showing how Enforra acts as a guardrail wrapper within
a real LangGraph tool-execution node.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Annotated
from typing_extensions import TypedDict

from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from enforra import EnforraClient

# Initialize Enforra client
example_dir = Path(__file__).resolve().parent
client = EnforraClient(
    policy_path=example_dir / "policy.yaml",
    audit_path=example_dir / ".enforra" / "audit.jsonl",
    agent="coding-agent",
)

# Define actual LangChain / LangGraph tools wrapped with Enforra
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


@tool
def run_command(command: str) -> dict:
    """Run a terminal command.

    Args:
        command: Command to execute.
    """
    result = client.run_tool(
        tool_name="terminal.run",
        args={"command": command},
        handler=lambda: {"exit_code": 0, "stdout": "added 1 package"},
    )
    return {
        "decision": result.decision,
        "executed": result.executed,
        "status": result.status,
        "reason": result.reason,
    }


@tool
def refund_customer(amount: float) -> dict:
    """Issue a customer refund.

    Args:
        amount: Refund amount.
    """
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": amount},
        handler=lambda: {"refund_id": "ref_small", "status": "succeeded"},
    )
    return {
        "decision": result.decision,
        "executed": result.executed,
        "status": result.status,
        "reason": result.reason,
    }


# Define the LangGraph State
class State(TypedDict):
    messages: Annotated[list, add_messages]


def main() -> None:
    print("=" * 56)
    print("Enforra + LangGraph Tool Integration Example")
    print("=" * 56)

    # Set up the ToolNode containing the wrapped tools
    tools = [read_file, run_command, refund_customer]
    tool_node = ToolNode(tools)

    # Build the StateGraph
    workflow = StateGraph(State)
    workflow.add_node("tools", tool_node)
    workflow.add_edge(START, "tools")
    workflow.add_edge("tools", END)
    graph = workflow.compile()

    # --- Tool 1: read_file (safe path → allow) ---
    res1 = graph.invoke({
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "read_file", "args": {"path": "/workspace/src/main.py"}, "id": "tc_1", "type": "tool_call"}]
            )
        ]
    })
    _print_graph_result("filesystem.read", {"path": "/workspace/src/main.py"}, res1)

    # --- Tool 2: read_file (.env file → block) ---
    res2 = graph.invoke({
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "read_file", "args": {"path": "/workspace/.env"}, "id": "tc_2", "type": "tool_call"}]
            )
        ]
    })
    _print_graph_result("filesystem.read", {"path": "/workspace/.env"}, res2)

    # --- Tool 3: run_command (→ require_approval) ---
    res3 = graph.invoke({
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "run_command", "args": {"command": "npm install express"}, "id": "tc_3", "type": "tool_call"}]
            )
        ]
    })
    _print_graph_result("terminal.run", {"command": "npm install express"}, res3)

    # --- Tool 4: refund_customer (small amount → allow) ---
    res4 = graph.invoke({
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "refund_customer", "args": {"amount": 25}, "id": "tc_4", "type": "tool_call"}]
            )
        ]
    })
    _print_graph_result("support.refund", {"amount": 25}, res4)

    # --- Tool 5: refund_customer (large amount → block by default) ---
    res5 = graph.invoke({
        "messages": [
            AIMessage(
                content="",
                tool_calls=[{"name": "refund_customer", "args": {"amount": 500}, "id": "tc_5", "type": "tool_call"}]
            )
        ]
    })
    _print_graph_result("support.refund", {"amount": 500}, res5)

    audit_path = example_dir / ".enforra" / "audit.jsonl"
    print(f"\nAudit log written to {audit_path}")


def _print_graph_result(tool_name: str, args: dict, result_state: dict) -> None:
    import json
    tool_msg = result_state["messages"][-1]
    content = None
    try:
        content = json.loads(tool_msg.content)
    except Exception:
        try:
            content = ast.literal_eval(tool_msg.content)
        except Exception:
            content = tool_msg.content

    print(f"\n--- Tool: {tool_name} ---")
    print(f"Args: {args}")
    if isinstance(content, dict):
        print(f"Decision: {content.get('decision')}")
        print(f"Executed: {'yes' if content.get('executed') else 'no'}")
        print(f"Status: {content.get('status')}")
        if content.get('reason'):
            print(f"Reason: {content.get('reason')}")
    else:
        print(f"Content: {content}")


if __name__ == "__main__":
    main()
