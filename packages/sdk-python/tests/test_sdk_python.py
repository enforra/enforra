from __future__ import annotations

import json
from pathlib import Path

import pytest

from enforra import EnforraClient

SUPPORT_POLICY = """
version: 1
defaults:
  decision: block
policies:
  - id: allow-small-refunds
    match:
      agent: support-agent
      tool: stripe.refund
    conditions:
      - field: args.amount
        operator: lte
        value: 50
    decision: allow

  - id: approve-medium-refunds
    priority: 20
    match:
      agent: support-agent
      tool: stripe.refund
    conditions:
      all:
        - field: args.amount
          operator: gt
          value: 50
        - field: args.amount
          operator: lte
          value: 500
    decision: require_approval

  - id: block-large-refunds
    priority: 10
    match:
      agent: support-agent
      tool: stripe.refund
    conditions:
      - field: args.amount
        operator: gt
        value: 500
    decision: block
"""

LOG_ONLY_POLICY = """
version: 1
defaults:
  decision: block
policies:
  - id: log-health-check
    match:
      agent: support-agent
      tool: health.check
    decision: log_only
"""

OBSERVE_POLICY = """
version: 1
mode: observe
defaults:
  decision: block
policies:
  - id: block-large-refunds
    match:
      agent: support-agent
      tool: stripe.refund
    conditions:
      - field: args.amount
        operator: gt
        value: 500
    decision: block

  - id: approve-medium-refunds
    match:
      agent: support-agent
      tool: stripe.refund
    conditions:
      all:
        - field: args.amount
          operator: gt
          value: 50
        - field: args.amount
          operator: lte
          value: 500
    decision: require_approval
"""

OPERATORS_POLICY = """
version: 1
defaults:
  decision: block
policies:
  - id: eq
    match:
      agent: operator-agent
      tool: tool.eq
    conditions:
      - field: args.value
        operator: eq
        value: x
    decision: allow
  - id: neq
    match:
      agent: operator-agent
      tool: tool.neq
    conditions:
      - field: args.value
        operator: neq
        value: x
    decision: allow
  - id: gt
    match:
      agent: operator-agent
      tool: tool.gt
    conditions:
      - field: args.value
        operator: gt
        value: 5
    decision: allow
  - id: gte
    match:
      agent: operator-agent
      tool: tool.gte
    conditions:
      - field: args.value
        operator: gte
        value: 10
    decision: allow
  - id: lt
    match:
      agent: operator-agent
      tool: tool.lt
    conditions:
      - field: args.value
        operator: lt
        value: 5
    decision: allow
  - id: lte
    match:
      agent: operator-agent
      tool: tool.lte
    conditions:
      - field: args.value
        operator: lte
        value: 5
    decision: allow
  - id: contains
    match:
      agent: operator-agent
      tool: tool.contains
    conditions:
      - field: args.value
        operator: contains
        value: "@example.com"
    decision: allow
  - id: not_contains
    match:
      agent: operator-agent
      tool: tool.not_contains
    conditions:
      - field: args.value
        operator: not_contains
        value: "@example.com"
    decision: allow
  - id: any
    match:
      agent: operator-agent
      tool: tool.any
    conditions:
      any:
        - field: context.environment
          operator: eq
          value: staging
        - field: context.environment
          operator: eq
          value: development
    decision: allow
"""


def test_allow_executes_handler(tmp_path: Path) -> None:
    client = create_client(tmp_path, SUPPORT_POLICY)
    called = {"value": False}

    def handler() -> dict[str, bool]:
        called["value"] = True
        return {"refunded": True}

    result = client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 20},
        context={"environment": "production"},
        handler=handler,
    )

    assert called["value"] is True
    assert result.ok is True
    assert result.decision == "allow"
    assert result.status == "executed"
    assert result.result == {"refunded": True}


def test_block_does_not_execute_handler(tmp_path: Path) -> None:
    client = create_client(tmp_path, SUPPORT_POLICY)
    called = {"value": False}

    def handler() -> None:
        called["value"] = True

    result = client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 1000},
        handler=handler,
    )

    assert called["value"] is False
    assert result.ok is False
    assert result.decision == "block"
    assert result.status == "blocked"


def test_require_approval_does_not_execute_handler(tmp_path: Path) -> None:
    client = create_client(tmp_path, SUPPORT_POLICY)
    called = {"value": False}

    def handler() -> None:
        called["value"] = True

    result = client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 250},
        handler=handler,
    )

    assert called["value"] is False
    assert result.ok is False
    assert result.decision == "require_approval"
    assert result.status == "pending_approval"


def test_log_only_executes_handler_and_logs(tmp_path: Path) -> None:
    client = create_client(tmp_path, LOG_ONLY_POLICY)

    result = client.run_tool(
        tool_name="health.check",
        args={},
        handler=lambda: {"ok": True},
    )

    assert result.ok is True
    assert result.decision == "log_only"
    assert result.status == "logged"
    events = read_audit_events(tmp_path / ".enforra" / "audit.jsonl")
    assert [event["status"] for event in events] == ["decision_logged", "logged"]


def test_observe_mode_executes_even_when_policy_would_block(tmp_path: Path) -> None:
    client = create_client(tmp_path, OBSERVE_POLICY)
    called = {"value": False}

    def handler() -> dict[str, bool]:
        called["value"] = True
        return {"refunded": True}

    result = client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 1000},
        handler=handler,
    )

    assert called["value"] is True
    assert result.ok is True
    assert result.decision == "allow"
    assert result.observed_decision == "block"
    assert result.effective_decision == "allow"
    assert result.observe_mode is True
    assert result.shadow is True


def test_observe_mode_logs_observed_and_effective_decisions(tmp_path: Path) -> None:
    client = create_client(tmp_path, OBSERVE_POLICY)

    client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 250},
        handler=lambda: {"refunded": True},
    )

    events = read_audit_events(tmp_path / ".enforra" / "audit.jsonl")
    assert events[0]["observed_decision"] == "require_approval"
    assert events[0]["effective_decision"] == "allow"
    assert events[0]["enforcement_mode"] == "observe"
    assert events[0]["shadow"] is True
    assert events[0]["observe_mode"] is True


def test_audit_log_is_written(tmp_path: Path) -> None:
    client = create_client(tmp_path, SUPPORT_POLICY)

    client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 20},
        handler=lambda: {"refunded": True},
    )

    audit_path = tmp_path / ".enforra" / "audit.jsonl"
    assert audit_path.exists()
    events = read_audit_events(audit_path)
    assert len(events) == 2
    assert events[0]["tool_name"] == "stripe.refund"


def test_sensitive_args_are_redacted(tmp_path: Path) -> None:
    client = create_client(tmp_path, LOG_ONLY_POLICY)

    client.run_tool(
        tool_name="health.check",
        args={
            "api_key": "secret-key",
            "nested": {"private_key": "private", "token_value": "abc"},
            "safe": "ok",
        },
        context={"password": "hidden"},
        handler=lambda: {"ok": True},
    )

    events = read_audit_events(tmp_path / ".enforra" / "audit.jsonl")
    args_redacted = events[0]["args_redacted"]
    context_redacted = events[0]["context_redacted"]
    assert args_redacted["api_key"] == "[REDACTED]"
    assert args_redacted["nested"]["private_key"] == "[REDACTED]"
    assert args_redacted["nested"]["token_value"] == "[REDACTED]"
    assert args_redacted["safe"] == "ok"
    assert context_redacted["password"] == "[REDACTED]"


def test_missing_policy_default_blocks(tmp_path: Path) -> None:
    client = create_client(
        tmp_path,
        """
version: 1
policies:
  - id: allow-other-tool
    match:
      tool: other.tool
    decision: allow
""",
    )

    result = client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 20},
        handler=lambda: {"refunded": True},
    )

    assert result.ok is False
    assert result.decision == "block"
    assert result.reason == "no matching policy; default decision block"


def test_handler_error_is_logged(tmp_path: Path) -> None:
    client = create_client(tmp_path, SUPPORT_POLICY)

    def handler() -> None:
        raise RuntimeError("refund failed")

    result = client.run_tool(
        tool_name="stripe.refund",
        args={"amount": 20},
        handler=handler,
    )

    assert result.ok is False
    assert result.status == "failed"
    assert result.error == "refund failed"
    events = read_audit_events(tmp_path / ".enforra" / "audit.jsonl")
    assert events[-1]["status"] == "failed"
    assert events[-1]["error"] == "refund failed"


@pytest.mark.parametrize(
    ("policy", "tool_name", "args", "context", "expected_decision"),
    [
        (OPERATORS_POLICY, "tool.eq", {"value": "x"}, None, "allow"),
        (OPERATORS_POLICY, "tool.neq", {"value": "y"}, None, "allow"),
        (OPERATORS_POLICY, "tool.gt", {"value": 9}, None, "allow"),
        (OPERATORS_POLICY, "tool.gte", {"value": 10}, None, "allow"),
        (OPERATORS_POLICY, "tool.lt", {"value": 4}, None, "allow"),
        (OPERATORS_POLICY, "tool.lte", {"value": 5}, None, "allow"),
        (OPERATORS_POLICY, "tool.contains", {"value": "abc@example.com"}, None, "allow"),
        (
            OPERATORS_POLICY,
            "tool.not_contains",
            {"value": "user@outside.com"},
            None,
            "allow",
        ),
        (OPERATORS_POLICY, "tool.any", {"value": 1}, {"environment": "staging"}, "allow"),
    ],
)
def test_condition_operators_used_in_starter_policies_work(
    tmp_path: Path,
    policy: str,
    tool_name: str,
    args: dict[str, object],
    context: dict[str, object] | None,
    expected_decision: str,
) -> None:
    client = create_client(tmp_path, policy, agent="operator-agent")

    result = client.run_tool(
        tool_name=tool_name,
        args=args,
        context=context,
        handler=lambda: {"ok": True},
    )

    assert result.decision == expected_decision


def create_client(tmp_path: Path, policy_source: str, agent: str = "support-agent") -> EnforraClient:
    policy_path = tmp_path / "policy.yaml"
    policy_path.write_text(policy_source, encoding="utf-8")
    return EnforraClient(
        policy_path=policy_path,
        audit_path=tmp_path / ".enforra" / "audit.jsonl",
        agent=agent,
    )


def read_audit_events(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
