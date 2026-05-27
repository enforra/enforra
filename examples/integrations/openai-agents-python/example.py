"""OpenAI Agents SDK Python Integration Example with Enforra policy enforcement.

This example uses the actual 'openai-agents' package tool abstraction to show
how Enforra wraps tool functions registered with the OpenAI Agents SDK.
"""

from __future__ import annotations

from pathlib import Path
from agents import function_tool
from enforra import EnforraClient

# Initialize Enforra client
example_dir = Path(__file__).resolve().parent
client = EnforraClient(
    policy_path=example_dir / "policy.yaml",
    audit_path=example_dir / ".enforra" / "audit.jsonl",
    agent="coding-agent",
)

# Define functions wrapped with Enforra and registered as Agents SDK function_tools
def read_file_impl(path: str) -> dict:
    """Read a file from the filesystem."""
    result = client.run_tool(
        tool_name="filesystem.read",
        args={"path": path},
        handler=lambda: {"content": "# Project README"},
    )
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}

# Register with OpenAI Agents SDK
read_file = function_tool(read_file_impl)


def create_github_issue_impl(title: str, repo: str) -> dict:
    """Create a GitHub issue."""
    result = client.run_tool(
        tool_name="github.create_issue",
        args={"title": title, "repo": repo},
        handler=lambda: {"issue_number": 42, "url": f"https://github.com/{repo}/issues/42"},
    )
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}

# Register with OpenAI Agents SDK
create_github_issue = function_tool(create_github_issue_impl)


def refund_customer_impl(amount: float, customer_id: str) -> dict:
    """Issue a customer refund."""
    result = client.run_tool(
        tool_name="support.refund",
        args={"amount": amount, "customer_id": customer_id},
        handler=lambda: {"refund_id": "ref_ok", "status": "succeeded"},
    )
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}

# Register with OpenAI Agents SDK
refund_customer = function_tool(refund_customer_impl)


def main() -> None:
    print("=" * 56)
    print("Enforra + OpenAI Agents SDK Tool Integration Example")
    print("=" * 56)

    # --- Tool 1: read_file (safe path → allow) ---
    result = read_file_impl("/workspace/README.md")
    _print_result("filesystem.read", {"path": "/workspace/README.md"}, result)

    # --- Tool 2: read_file (.env → block) ---
    result = read_file_impl("/workspace/.env")
    _print_result("filesystem.read", {"path": "/workspace/.env"}, result)

    # --- Tool 3: create_github_issue (→ require_approval) ---
    result = create_github_issue_impl("Fix login bug", "acme/app")
    _print_result("github.create_issue", {"title": "Fix login bug"}, result)

    # --- Tool 4: refund_customer (small → allow) ---
    result = refund_customer_impl(30, "cus_789")
    _print_result("support.refund", {"amount": 30}, result)

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
