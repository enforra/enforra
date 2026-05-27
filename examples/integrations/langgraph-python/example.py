"""LangGraph-style tool wrapper pattern with Enforra policy enforcement.

This example shows how Enforra wraps tool functions that would be called
from LangGraph tool nodes. No real LLM or LangGraph dependency is required.
The pattern is the same: Enforra evaluates policy before the tool body runs.
"""

from __future__ import annotations

from pathlib import Path

from enforra import EnforraClient


def main() -> None:
    example_dir = Path(__file__).resolve().parent
    client = EnforraClient(
        policy_path=example_dir / "policy.yaml",
        audit_path=example_dir / ".enforra" / "audit.jsonl",
        agent="coding-agent",
    )

    print("=" * 56)
    print("Enforra + LangGraph-Style Tool Wrapper Pattern")
    print("=" * 56)

    # --- Tool 1: filesystem.read (safe path → allow) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/src/main.py"},
        handler=lambda: {"content": "# main application code"},
    )
    _print_result("filesystem.read", {"path": "/workspace/src/main.py"}, result)

    # --- Tool 2: filesystem.read (.env file → block) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/.env"},
        handler=lambda: {"content": "SECRET_KEY=abc123"},
    )
    _print_result("filesystem.read", {"path": "/workspace/.env"}, result)

    # --- Tool 3: terminal.run (→ require_approval) ---
    result = client.run_tool(
        tool_name="terminal.run",
        args={"command": "npm install express"},
        handler=lambda: {"exit_code": 0, "stdout": "added 1 package"},
    )
    _print_result("terminal.run", {"command": "npm install express"}, result)

    # --- Tool 4: support.refund (small amount → allow) ---
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": 25, "customer_id": "cus_123"},
        handler=lambda: {"refund_id": "ref_small", "status": "succeeded"},
    )
    _print_result("support.refund", {"amount": 25}, result)

    # --- Tool 5: support.refund (large amount → block by default) ---
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": 500, "customer_id": "cus_456"},
        handler=lambda: {"refund_id": "ref_large", "status": "succeeded"},
    )
    _print_result("support.refund", {"amount": 500}, result)

    audit_path = example_dir / ".enforra" / "audit.jsonl"
    print(f"Audit log written to {audit_path}")


def _print_result(tool: str, args: dict, result) -> None:
    print(f"\n--- Tool: {tool} ---")
    print(f"Args: {args}")
    print(f"Decision: {result.decision}")
    print(f"Executed: {'yes' if result.executed else 'no'}")
    print(f"Status: {result.status}")
    if result.reason:
        print(f"Reason: {result.reason}")


if __name__ == "__main__":
    main()
