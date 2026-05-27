"""AutoGen-style function tool pattern with Enforra policy enforcement.

This example shows how Enforra wraps a function tool that would be
registered with an AutoGen agent. No real AutoGen dependency or LLM
API key is required. The pattern is the same: Enforra evaluates policy
before the function body runs.
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
    print("Enforra + AutoGen-Style Function Tool Pattern")
    print("=" * 56)

    # --- Tool 1: filesystem.read (safe → allow) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/docs/guide.md"},
        handler=lambda: {"content": "# Getting started guide"},
    )
    _print_result("filesystem.read", {"path": "/workspace/docs/guide.md"}, result)

    # --- Tool 2: filesystem.read (private key → block) ---
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": "/workspace/.ssh/private_key"},
        handler=lambda: {"content": "-----BEGIN RSA PRIVATE KEY-----"},
    )
    _print_result("filesystem.read", {"path": "/workspace/.ssh/private_key"}, result)

    # --- Tool 3: terminal.run (→ require_approval) ---
    result = client.run_tool(
        tool_name="terminal.run",
        args={"command": "pip install requests"},
        handler=lambda: {"exit_code": 0, "stdout": "Successfully installed requests"},
    )
    _print_result("terminal.run", {"command": "pip install requests"}, result)

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
