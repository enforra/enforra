import sys
import os
import json
from pathlib import Path

# Force python to find enforra sdk package
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "sdk-python" / "src"))

from agents import function_tool
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

# Define function wrapped with Enforra and registered as Agents SDK function_tools
def read_file_impl(path: str) -> dict:
    """Read a file from the filesystem."""
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

read_file = function_tool(read_file_impl)


def run_command_impl(command: str) -> dict:
    """Run a terminal command."""
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

run_command = function_tool(run_command_impl)


def create_github_issue_impl(title: str, repo: str) -> dict:
    """Create a GitHub issue."""
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

create_github_issue = function_tool(create_github_issue_impl)


def refund_customer_impl(amount: float, customer_id: str) -> dict:
    """Issue a customer refund."""
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

refund_customer = function_tool(refund_customer_impl)


def main() -> None:
    scenarios = [
        ("filesystem.read", {"path": "/workspace/src/app.ts"}, read_file_impl, ["/workspace/src/app.ts"]),
        ("filesystem.read", {"path": "/workspace/.env"}, read_file_impl, ["/workspace/.env"]),
        ("terminal.run", {"command": "npm install express"}, run_command_impl, ["npm install express"]),
        ("github.create_issue", {"title": "Fix login bug", "repo": "acme/app"}, create_github_issue_impl, ["Fix login bug", "acme/app"]),
        ("support.refund", {"amount": 25, "customer_id": "cus_123"}, refund_customer_impl, [25, "cus_123"]),
        ("support.refund", {"amount": 150, "customer_id": "cus_456"}, refund_customer_impl, [150, "cus_456"]),
    ]

    results = []

    for tool_name, args, impl_fn, fn_args in scenarios:
        content = impl_fn(*fn_args)
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
