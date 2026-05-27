"""LangGraph Python Integration Example with Enforra policy enforcement.

This example uses the actual 'langchain-core' tool abstraction to show
how Enforra wraps tool functions called in LangGraph/LangChain tool execution paths.
"""

from __future__ import annotations

from pathlib import Path
from langchain_core.tools import tool
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
    # Return Enforra decision and execution data
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}

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
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}

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
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}


def main() -> None:
    print("=" * 56)
    print("Enforra + LangGraph Tool Integration Example")
    print("=" * 56)

    # --- Tool 1: read_file (safe path → allow) ---
    result = read_file.invoke({"path": "/workspace/src/main.py"})
    _print_result("filesystem.read", {"path": "/workspace/src/main.py"}, result)

    # --- Tool 2: read_file (.env file → block) ---
    result = read_file.invoke({"path": "/workspace/.env"})
    _print_result("filesystem.read", {"path": "/workspace/.env"}, result)

    # --- Tool 3: run_command (→ require_approval) ---
    result = run_command.invoke({"command": "npm install express"})
    _print_result("terminal.run", {"command": "npm install express"}, result)

    # --- Tool 4: refund_customer (small amount → allow) ---
    result = refund_customer.invoke({"amount": 25})
    _print_result("support.refund", {"amount": 25}, result)

    # --- Tool 5: refund_customer (large amount → block by default) ---
    result = refund_customer.invoke({"amount": 500})
    _print_result("support.refund", {"amount": 500}, result)

    audit_path = example_dir / ".enforra" / "audit.jsonl"
    print(f"\nAudit log written to {audit_path}")


def _print_result(tool_name: str, args: dict, result: dict) -> None:
    print(f"\n--- Tool: {tool_name} ---")
    print(f"Args: {args}")
    print(f"Decision: {result['decision']}")
    print(f"Executed: {'yes' if result['executed'] else 'no'}")
    print(f"Status: {result['status']}")
    if result['reason']:
        print(f"Reason: {result['reason']}")


if __name__ == "__main__":
    main()
