import sys
import os
import json
from pathlib import Path
from typing import Annotated
from typing_extensions import TypedDict

# Force python to find enforra sdk package
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "sdk-python" / "src"))

from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from enforra import EnforraClient

# Parse command line args for policy and audit paths
policy_path = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[3] / "policies" / "starter" / "cross-framework.yaml")
audit_path = sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent / "audit.jsonl")

# Initialize Enforra client
client = EnforraClient(
    policy_path=policy_path,
    audit_path=audit_path,
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
def create_github_issue(title: str, repo: str) -> dict:
    """Create a GitHub issue.

    Args:
        title: Title of the issue.
        repo: Repository name.
    """
    result = client.run_tool(
        tool_name="github.create_issue",
        args={"title": title, "repo": repo},
        handler=lambda: {"issue_number": 101, "url": f"https://github.com/{repo}/issues/101"},
    )
    return {
        "decision": result.decision,
        "executed": result.executed,
        "status": result.status,
        "reason": result.reason,
    }


@tool
def refund_customer(amount: float, customer_id: str) -> dict:
    """Issue a customer refund.

    Args:
        amount: Refund amount.
        customer_id: Customer ID.
    """
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": amount, "customer_id": customer_id},
        handler=lambda: {"refund_id": "ref_ok", "status": "succeeded"},
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
    # Set up the ToolNode containing the wrapped tools
    tools = [read_file, run_command, create_github_issue, refund_customer]
    tool_node = ToolNode(tools)

    # Build the StateGraph
    workflow = StateGraph(State)
    workflow.add_node("tools", tool_node)
    workflow.add_edge(START, "tools")
    workflow.add_edge("tools", END)
    graph = workflow.compile()

    scenarios = [
        ("filesystem.read", {"path": "/workspace/src/app.ts"}, "read_file", {"path": "/workspace/src/app.ts"}, "tc_1"),
        ("filesystem.read", {"path": "/workspace/.env"}, "read_file", {"path": "/workspace/.env"}, "tc_2"),
        ("terminal.run", {"command": "npm install express"}, "run_command", {"command": "npm install express"}, "tc_3"),
        ("github.create_issue", {"title": "Fix login bug", "repo": "acme/app"}, "create_github_issue", {"title": "Fix login bug", "repo": "acme/app"}, "tc_4"),
        ("support.refund", {"amount": 25, "customer_id": "cus_123"}, "refund_customer", {"amount": 25, "customer_id": "cus_123"}, "tc_5"),
        ("support.refund", {"amount": 150, "customer_id": "cus_456"}, "refund_customer", {"amount": 150, "customer_id": "cus_456"}, "tc_6"),
    ]

    results = []

    for tool_name, args, lg_tool_name, lg_args, tc_id in scenarios:
        res = graph.invoke({
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[{"name": lg_tool_name, "args": lg_args, "id": tc_id, "type": "tool_call"}]
                )
            ]
        })
        tool_msg = res["messages"][-1]
        content = json.loads(tool_msg.content)
        # Map decision to results format
        results.append({
            "tool": tool_name,
            "args": args,
            "decision": content.get("decision"),
            "executed": content.get("executed"),
            "status": content.get("status"),
            "reason": content.get("reason", "")
        })

    # Print results as JSON
    print(json.dumps(results))


if __name__ == "__main__":
    main()
