from typing import Annotated
from typing_extensions import TypedDict
from langchain_core.messages import AIMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from enforra import EnforraClient

# 1. Initialize Enforra client loaded with local policy
client = EnforraClient(
    policy_path="./policy.yaml",
    agent="langgraph-agent"
)

# 2. Define tools using LangChain @tool decorator, guarded by Enforra
@tool
def read_file(path: str) -> dict:
    """Read a file from the filesystem.

    Args:
        path: Path to the file to read.
    """
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": path},
        handler=lambda: {"content": f"[Mock file content for {path}]"}
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
        handler=lambda: {"exit_code": 0, "stdout": "success"}
    )
    return {
        "decision": result.decision,
        "executed": result.executed,
        "status": result.status,
        "reason": result.reason,
    }

# 3. Define the LangGraph State
class State(TypedDict):
    messages: Annotated[list, add_messages]

# 4. Set up tools and build the StateGraph
tools = [read_file, run_command]
tool_node = ToolNode(tools)

workflow = StateGraph(State)
workflow.add_node("tools", tool_node)
workflow.add_edge(START, "tools")
workflow.add_edge("tools", END)
graph = workflow.compile()

def main():
    print("--- Scenario 1: Allowed Filesystem Read (safe path) ---")
    try:
        response = graph.invoke({
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[{"name": "read_file", "args": {"path": "/workspace/src/app.ts"}, "id": "call_01", "type": "tool_call"}]
                )
            ]
        })
        tool_msg = response["messages"][-1]
        print("Response:", tool_msg.content)
    except Exception as e:
        print("Blocked/Failed:", str(e))

    print("\n--- Scenario 2: Blocked Filesystem Read (.env file) ---")
    try:
        response = graph.invoke({
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[{"name": "read_file", "args": {"path": "/workspace/.env"}, "id": "call_02", "type": "tool_call"}]
                )
            ]
        })
        tool_msg = response["messages"][-1]
        print("Response:", tool_msg.content)
    except Exception as e:
        print("Blocked/Failed:", str(e))

    print("\n--- Scenario 3: Terminal command requiring approval ---")
    try:
        response = graph.invoke({
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[{"name": "run_command", "args": {"command": "npm install express"}, "id": "call_03", "type": "tool_call"}]
                )
            ]
        })
        tool_msg = response["messages"][-1]
        print("Response:", tool_msg.content)
    except Exception as e:
        print("Blocked/Failed:", str(e))

if __name__ == "__main__":
    main()
