"""OpenAI Agents SDK-style tool wrapper pattern with Enforra policy enforcement.

This example shows how Enforra wraps tool functions that would be registered
with the OpenAI Agents SDK. No real OpenAI API key or Agents SDK dependency
is required. The pattern is the same: Enforra evaluates policy before the
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
    print("Enforra + OpenAI Agents SDK-Style Tool Wrapper Pattern")
    print("=" * 56)

    # --- Tool 1: filesystem.read (safe path → allow) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/README.md"},
        handler=lambda: {"content": "# Project README"},
    )
    _print_result("filesystem.read", {"path": "/workspace/README.md"}, result)

    # --- Tool 2: filesystem.read (.env → block) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/.env"},
        handler=lambda: {"content": "API_KEY=secret"},
    )
    _print_result("filesystem.read", {"path": "/workspace/.env"}, result)

    # --- Tool 3: github.create_issue (→ require_approval) ---
    result = client.run_tool(
        tool_name="github.create_issue",
        args={"title": "Fix login bug", "repo": "acme/app"},
        handler=lambda: {"issue_number": 42, "url": "https://github.com/acme/app/issues/42"},
    )
    _print_result("github.create_issue", {"title": "Fix login bug"}, result)

    # --- Tool 4: support.refund (small → allow) ---
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": 30, "customer_id": "cus_789"},
        handler=lambda: {"refund_id": "ref_ok", "status": "succeeded"},
    )
    _print_result("support.refund", {"amount": 30}, result)

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
