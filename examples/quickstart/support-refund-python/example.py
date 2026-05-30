from __future__ import annotations

import argparse
from pathlib import Path

from enforra import EnforraClient


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--observe", action="store_true")
    parsed = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[3]
    policy_path = (
        repo_root / "examples" / "quickstart" / "support-refund-node" / "policies" / "observe-policy.yaml"
        if parsed.observe
        else repo_root / "policies" / "starter" / "support-agent.yaml"
    )
    audit_path = repo_root / ".enforra" / "python-support-refund-audit.jsonl"

    client = EnforraClient(
        policy_path=policy_path,
        audit_path=audit_path,
        agent="support-agent",
    )

    print("Enforra Python support refund demo\n")
    for amount in (20, 250, 1000):
        result = client.run_tool(
            tool_name="stripe.refund",
            args={"amount": amount, "customer_id": "cus_123"},
            context={"environment": "production"},
            handler=lambda amount=amount: refund_customer(amount),
        )
        print(f"Tool call: stripe.refund")
        print(f"Agent: support-agent")
        print(f"Amount: {amount}")
        print(f"Decision: {result.decision}")
        print(f"Observed Decision: {result.observed_decision}")
        print(f"Executed: {'yes' if result.executed else 'no'}")
        print(f"Status: {result.status}")
        if result.reason:
            print(f"Reason: {result.reason}")
        print("")

    print(f"Audit log written to {audit_path.relative_to(repo_root)}")


def refund_customer(amount: int) -> dict[str, object]:
    return {"refund_id": f"py_ref_{amount}", "status": "succeeded"}


if __name__ == "__main__":
    main()
