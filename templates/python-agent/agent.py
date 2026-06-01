from enforra import EnforraClient

def main():
    # 1. Initialize Enforra client loaded with local policy
    client = EnforraClient(
        policy_path="./policy.yaml",
        agent="support-agent"
    )

    # 2. Define the tool runner
    def refund_tool(amount: float):
        result = client.run_tool(
            tool_name="support.refund",
            args={"amount": amount},
            handler=lambda: {"success": True, "refundedAmount": amount}
        )
        return result

    # 3. Simulate tool calls
    print("--- Scenario 1: Small Refund ($25, Allowed) ---")
    result = refund_tool(25)
    print("Decision:", result.decision)
    print("Executed:", "yes" if result.executed else "no")
    print("Status:", result.status)
    print("Result:", result.result)

    print("\n--- Scenario 2: Medium Refund ($150, Requires Approval) ---")
    result = refund_tool(150)
    print("Decision:", result.decision)
    print("Executed:", "yes" if result.executed else "no")
    print("Status:", result.status)
    if result.reason:
        print("Reason:", result.reason)

    print("\n--- Scenario 3: Large Refund ($800, Blocked) ---")
    result = refund_tool(800)
    print("Decision:", result.decision)
    print("Executed:", "yes" if result.executed else "no")
    print("Status:", result.status)
    if result.reason:
        print("Reason:", result.reason)

if __name__ == "__main__":
    main()
