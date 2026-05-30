"""CrewAI-style custom tool pattern with Enforra policy enforcement.

This example shows how Enforra wraps a custom tool _run method that would
be used in a CrewAI crew. No real CrewAI dependency or LLM API key is
required. The pattern is the same: Enforra evaluates policy before the
tool body runs.
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
    print("Enforra + CrewAI-Style Custom Tool Pattern")
    print("=" * 56)

    # --- Tool 1: filesystem.read (safe → allow) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/config.json"},
        handler=lambda: {"content": '{"debug": true}'},
    )
    _print_result("filesystem.read", {"path": "/workspace/config.json"}, result)

    # --- Tool 2: filesystem.write (→ require_approval) ---
    result = client.run_tool(
        tool_name="filesystem.write",
        args={"path": "/workspace/output.txt", "content": "results"},
        handler=lambda: {"written": True},
    )
    _print_result("filesystem.write", {"path": "/workspace/output.txt"}, result)

    # --- Tool 3: support.refund (small → allow) ---
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": 15, "customer_id": "cus_321"},
        handler=lambda: {"refund_id": "ref_crew", "status": "succeeded"},
    )
    _print_result("support.refund", {"amount": 15}, result)

    # --- Tool 4: support.refund (large → block) ---
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": 999, "customer_id": "cus_999"},
        handler=lambda: {"refund_id": "ref_big", "status": "succeeded"},
    )
    _print_result("support.refund", {"amount": 999}, result)

    audit_path = example_dir / ".enforra" / "audit.jsonl"
    print(f"\nAudit log written to {audit_path}")


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
