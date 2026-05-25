from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml

Decision = Literal["allow", "block", "require_approval", "log_only"]
ConditionOperator = Literal[
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "not_contains",
]
ConditionGroupOperator = Literal["all", "any"]

VALID_DECISIONS = {"allow", "block", "require_approval", "log_only"}
VALID_OPERATORS = {"eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains"}


@dataclass(frozen=True)
class PolicyCondition:
    field: str
    operator: ConditionOperator
    value: str | int | float | bool


@dataclass(frozen=True)
class PolicyConditionGroup:
    all: tuple[PolicyCondition, ...] | None = None
    any: tuple[PolicyCondition, ...] | None = None


@dataclass(frozen=True)
class PolicyMatch:
    agent: str | None = None
    tool: str | None = None


@dataclass(frozen=True)
class PolicyRule:
    id: str
    match: PolicyMatch
    decision: Decision
    description: str | None = None
    priority: int | None = None
    conditions: tuple[PolicyCondition, ...] | PolicyConditionGroup | None = None


@dataclass(frozen=True)
class PolicyFile:
    version: Literal[1]
    policies: tuple[PolicyRule, ...]
    mode: Literal["enforce", "observe"] | None = None
    observe_only: bool = False
    defaults: dict[str, Decision] | None = None


@dataclass(frozen=True)
class PolicyEvaluationResult:
    decision: Decision
    matched_policy_id: str | None
    reason: str
    evaluated_at: str
    policy_version: Literal[1]
    enforcement_mode: Literal["enforce", "observe"]
    observed_decision: Decision


def load_policy_file(path: str | Path) -> PolicyFile:
    source = Path(path).read_text(encoding="utf-8")
    return parse_policy_yaml(source)


def parse_policy_yaml(source: str) -> PolicyFile:
    parsed = yaml.safe_load(source)
    if not isinstance(parsed, dict):
        raise ValueError("policy file must be a YAML object")

    version = parsed.get("version")
    if version != 1:
        raise ValueError("policy version must be 1")

    policies_raw = parsed.get("policies")
    if not isinstance(policies_raw, list):
        raise ValueError("policy file must include a policies array")

    defaults = parsed.get("defaults")
    parsed_defaults: dict[str, Decision] | None = None
    if defaults is not None:
        if not isinstance(defaults, dict):
            raise ValueError("defaults must be an object")
        default_decision = defaults.get("decision")
        if default_decision is not None:
            _validate_decision(default_decision)
            parsed_defaults = {"decision": default_decision}

    mode = parsed.get("mode")
    if mode is not None and mode not in {"enforce", "observe"}:
        raise ValueError("mode must be enforce or observe")

    observe_only = parsed.get("observe_only", False)
    if not isinstance(observe_only, bool):
        raise ValueError("observe_only must be a boolean")

    policies = tuple(_parse_policy_rule(entry) for entry in policies_raw)
    return PolicyFile(
        version=1,
        mode=mode,
        observe_only=observe_only,
        defaults=parsed_defaults,
        policies=policies,
    )


def evaluate_policy(
    policy_file: PolicyFile,
    *,
    agent: str,
    tool_name: str,
    args: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> PolicyEvaluationResult:
    matched_policy = None
    for policy in _get_policies_in_evaluation_order(policy_file.policies):
        if _policy_matches(policy, agent=agent, tool_name=tool_name, args=args, context=context):
            matched_policy = policy
            break

    observed_decision = (
        matched_policy.decision
        if matched_policy is not None
        else (policy_file.defaults or {}).get("decision", "block")
    )
    enforcement_mode: Literal["enforce", "observe"] = (
        "observe" if policy_file.mode == "observe" or policy_file.observe_only else "enforce"
    )
    effective_decision = observed_decision
    if enforcement_mode == "observe" and observed_decision in {"block", "require_approval"}:
        effective_decision = "allow"

    reason = (
        f"matched policy {matched_policy.id}"
        if matched_policy is not None
        else f"no matching policy; default decision {observed_decision}"
    )

    return PolicyEvaluationResult(
        decision=effective_decision,
        matched_policy_id=matched_policy.id if matched_policy is not None else None,
        reason=reason,
        evaluated_at=_utc_timestamp(),
        policy_version=1,
        enforcement_mode=enforcement_mode,
        observed_decision=observed_decision,
    )


def _parse_policy_rule(raw: Any) -> PolicyRule:
    if not isinstance(raw, dict):
        raise ValueError("policy rule must be an object")

    rule_id = raw.get("id")
    if not isinstance(rule_id, str) or not rule_id:
        raise ValueError("policy rule id must be a non-empty string")

    match_raw = raw.get("match")
    if not isinstance(match_raw, dict):
        raise ValueError(f"policy {rule_id} must include match")

    match = PolicyMatch(
        agent=_optional_non_empty_string(match_raw.get("agent"), "match.agent"),
        tool=_optional_non_empty_string(match_raw.get("tool"), "match.tool"),
    )

    if match.agent is None and match.tool is None and raw.get("conditions") is None:
        raise ValueError(
            f"policy {rule_id} must include match.agent, match.tool, or conditions"
        )

    decision = raw.get("decision")
    _validate_decision(decision)

    priority = raw.get("priority")
    if priority is not None and (not isinstance(priority, int) or priority <= 0):
        raise ValueError(f"policy {rule_id} priority must be a positive integer")

    description = raw.get("description")
    if description is not None and not isinstance(description, str):
        raise ValueError(f"policy {rule_id} description must be a string")

    conditions = _parse_conditions(raw.get("conditions"), rule_id)
    return PolicyRule(
        id=rule_id,
        description=description,
        priority=priority,
        match=match,
        conditions=conditions,
        decision=decision,
    )


def _parse_conditions(
    raw: Any, rule_id: str
) -> tuple[PolicyCondition, ...] | PolicyConditionGroup | None:
    if raw is None:
        return None
    if isinstance(raw, list):
        if not raw:
            raise ValueError(f"policy {rule_id} conditions list cannot be empty")
        return tuple(_parse_condition(condition, rule_id) for condition in raw)
    if isinstance(raw, dict):
        has_all = "all" in raw
        has_any = "any" in raw
        if not has_all and not has_any:
            raise ValueError(f"policy {rule_id} condition group must include all or any")
        all_conditions = None
        any_conditions = None
        if has_all:
            if not isinstance(raw["all"], list) or not raw["all"]:
                raise ValueError(f"policy {rule_id} conditions.all must be a non-empty list")
            all_conditions = tuple(_parse_condition(condition, rule_id) for condition in raw["all"])
        if has_any:
            if not isinstance(raw["any"], list) or not raw["any"]:
                raise ValueError(f"policy {rule_id} conditions.any must be a non-empty list")
            any_conditions = tuple(_parse_condition(condition, rule_id) for condition in raw["any"])
        return PolicyConditionGroup(all=all_conditions, any=any_conditions)
    raise ValueError(f"policy {rule_id} conditions must be a list or group")


def _parse_condition(raw: Any, rule_id: str) -> PolicyCondition:
    if not isinstance(raw, dict):
        raise ValueError(f"policy {rule_id} condition must be an object")

    field = raw.get("field")
    operator = raw.get("operator")
    value = raw.get("value")
    if not isinstance(field, str) or not field:
        raise ValueError(f"policy {rule_id} condition field must be a non-empty string")
    if operator not in VALID_OPERATORS:
        raise ValueError(
            f"policy {rule_id} condition operator must be one of {sorted(VALID_OPERATORS)}"
        )
    if not isinstance(value, (str, int, float, bool)):
        raise ValueError(f"policy {rule_id} condition value must be string, number, or boolean")
    return PolicyCondition(field=field, operator=operator, value=value)


def _policy_matches(
    policy: PolicyRule,
    *,
    agent: str,
    tool_name: str,
    args: dict[str, Any],
    context: dict[str, Any] | None,
) -> bool:
    if policy.match.agent is not None and policy.match.agent != agent:
        return False
    if policy.match.tool is not None and policy.match.tool != tool_name:
        return False
    return _conditions_match(policy.conditions, args=args, context=context)


def _conditions_match(
    conditions: tuple[PolicyCondition, ...] | PolicyConditionGroup | None,
    *,
    args: dict[str, Any],
    context: dict[str, Any] | None,
) -> bool:
    if conditions is None:
        return True
    if isinstance(conditions, tuple):
        return all(_evaluate_condition(condition, args=args, context=context) for condition in conditions)

    if conditions.all is not None and not all(
        _evaluate_condition(condition, args=args, context=context) for condition in conditions.all
    ):
        return False
    if conditions.any is not None and not any(
        _evaluate_condition(condition, args=args, context=context) for condition in conditions.any
    ):
        return False
    return True


def _evaluate_condition(
    condition: PolicyCondition, *, args: dict[str, Any], context: dict[str, Any] | None
) -> bool:
    actual = _get_path_value(condition.field, args=args, context=context)
    if actual is None:
        return False

    if condition.operator == "eq":
        return actual == condition.value
    if condition.operator == "neq":
        return actual != condition.value
    if condition.operator == "gt":
        return _compare_numbers(actual, condition.value, lambda left, right: left > right)
    if condition.operator == "gte":
        return _compare_numbers(actual, condition.value, lambda left, right: left >= right)
    if condition.operator == "lt":
        return _compare_numbers(actual, condition.value, lambda left, right: left < right)
    if condition.operator == "lte":
        return _compare_numbers(actual, condition.value, lambda left, right: left <= right)
    if condition.operator == "contains":
        return isinstance(actual, str) and str(condition.value) in actual
    if condition.operator == "not_contains":
        return isinstance(actual, str) and str(condition.value) not in actual
    raise ValueError(f"unsupported operator {condition.operator}")


def _compare_numbers(actual: Any, expected: Any, compare: Any) -> bool:
    if isinstance(actual, bool) or isinstance(expected, bool):
        return False
    if not isinstance(actual, (int, float)) or not isinstance(expected, (int, float)):
        return False
    return bool(compare(actual, expected))


def _get_path_value(field: str, *, args: dict[str, Any], context: dict[str, Any] | None) -> Any:
    root, *segments = field.split(".")
    if not segments:
        return None

    if root == "args":
        current: Any = args
    elif root == "context":
        current = context
    else:
        return None

    for segment in segments:
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]
    return current


def _get_policies_in_evaluation_order(policies: tuple[PolicyRule, ...]) -> tuple[PolicyRule, ...]:
    indexed = list(enumerate(policies))
    indexed.sort(
        key=lambda entry: (
            entry[1].priority is None,
            entry[1].priority if entry[1].priority is not None else 0,
            entry[0],
        )
    )
    return tuple(policy for _, policy in indexed)


def _optional_non_empty_string(value: Any, field_name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")
    return value


def _validate_decision(value: Any) -> None:
    if value not in VALID_DECISIONS:
        raise ValueError(f"decision must be one of {sorted(VALID_DECISIONS)}")


def _utc_timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
