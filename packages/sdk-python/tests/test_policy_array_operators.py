from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from enforra.policy import PolicyCondition, PolicyFile, PolicyMatch, PolicyRule, evaluate_policy

FIXTURE_PATH = Path(__file__).resolve().parents[3] / "conformance" / "policy-array-operators.json"
FIXTURE = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
CASES: list[dict[str, Any]] = FIXTURE["cases"]


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_policy_array_operator_conformance(case: dict[str, Any]) -> None:
    policy = PolicyFile(
        version=1,
        defaults={"decision": "block"},
        policies=(
            PolicyRule(
                id="allow-when-condition-matches",
                match=PolicyMatch(tool="command.exec"),
                conditions=(
                    PolicyCondition(
                        field="args.actual",
                        operator=case["operator"],
                        value=case["value"],
                    ),
                ),
                decision="allow",
            ),
        ),
    )

    result = evaluate_policy(
        policy,
        agent="coding-agent",
        tool_name="command.exec",
        args={"actual": case["actual"]},
    )

    assert (result.decision == "allow") is case["expected"]
