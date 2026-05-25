from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Generic, Literal, TypeVar

from .audit import LocalAuditLogger, build_audit_event
from .policy import Decision, PolicyEvaluationResult, evaluate_policy, load_policy_file

T = TypeVar("T")


@dataclass
class ToolExecutionResult(Generic[T]):
    ok: bool
    decision: Decision
    status: Literal["executed", "logged", "blocked", "pending_approval", "failed"]
    reason: str
    tool_name: str
    agent: str
    executed: bool
    result: T | None = None
    error: str | None = None
    observed_decision: Decision | None = None
    effective_decision: Decision | None = None
    enforcement_mode: Literal["enforce", "observe"] = "enforce"
    observe_mode: bool = False
    shadow: bool = False
    matched_policy_id: str | None = None


class EnforraClient:
    def __init__(
        self,
        *,
        policy_path: str | Path,
        audit_path: str | Path = ".enforra/audit.jsonl",
        agent: str | None = None,
    ) -> None:
        self.policy_path = str(policy_path)
        self.policy_file = load_policy_file(policy_path)
        self.audit_logger = LocalAuditLogger(audit_path)
        self.agent = agent

    def run_tool(
        self,
        *,
        tool_name: str,
        args: dict[str, Any],
        handler: Callable[[], T],
        context: dict[str, Any] | None = None,
        agent: str | None = None,
    ) -> ToolExecutionResult[T]:
        resolved_agent = agent or self.agent
        if not resolved_agent:
            raise ValueError("agent must be provided on the client or per run_tool call")

        started_at = perf_counter()
        evaluation = evaluate_policy(
            self.policy_file,
            agent=resolved_agent,
            tool_name=tool_name,
            args=args,
            context=context,
        )

        if evaluation.decision == "block":
            self._append_audit_event(
                timestamp=evaluation.evaluated_at,
                tool_name=tool_name,
                agent=resolved_agent,
                args=args,
                context=context,
                evaluation=evaluation,
                status="blocked",
                reason=evaluation.reason,
                duration_ms=_duration_ms(started_at),
            )
            return ToolExecutionResult(
                ok=False,
                decision="block",
                status="blocked",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=False,
                observed_decision=evaluation.observed_decision,
                effective_decision=evaluation.decision,
                enforcement_mode=evaluation.enforcement_mode,
                observe_mode=evaluation.enforcement_mode == "observe",
                shadow=evaluation.enforcement_mode == "observe",
                matched_policy_id=evaluation.matched_policy_id,
            )

        if evaluation.decision == "require_approval":
            self._append_audit_event(
                timestamp=evaluation.evaluated_at,
                tool_name=tool_name,
                agent=resolved_agent,
                args=args,
                context=context,
                evaluation=evaluation,
                status="pending_approval",
                reason=evaluation.reason,
                duration_ms=_duration_ms(started_at),
            )
            return ToolExecutionResult(
                ok=False,
                decision="require_approval",
                status="pending_approval",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=False,
                observed_decision=evaluation.observed_decision,
                effective_decision=evaluation.decision,
                enforcement_mode=evaluation.enforcement_mode,
                observe_mode=evaluation.enforcement_mode == "observe",
                shadow=evaluation.enforcement_mode == "observe",
                matched_policy_id=evaluation.matched_policy_id,
            )

        self._append_audit_event(
            timestamp=evaluation.evaluated_at,
            tool_name=tool_name,
            agent=resolved_agent,
            args=args,
            context=context,
            evaluation=evaluation,
            status="decision_logged",
            reason=evaluation.reason,
            duration_ms=_duration_ms(started_at),
        )

        try:
            result = handler()
        except Exception as error:
            error_message = str(error)
            self._append_audit_event(
                timestamp=_utc_timestamp(),
                tool_name=tool_name,
                agent=resolved_agent,
                args=args,
                context=context,
                evaluation=evaluation,
                status="failed",
                reason=evaluation.reason,
                duration_ms=_duration_ms(started_at),
                error=error_message,
            )
            return ToolExecutionResult(
                ok=False,
                decision=evaluation.decision,
                status="failed",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=True,
                error=error_message,
                observed_decision=evaluation.observed_decision,
                effective_decision=evaluation.decision,
                enforcement_mode=evaluation.enforcement_mode,
                observe_mode=evaluation.enforcement_mode == "observe",
                shadow=evaluation.enforcement_mode == "observe",
                matched_policy_id=evaluation.matched_policy_id,
            )

        status = "logged" if evaluation.decision == "log_only" else "executed"
        self._append_audit_event(
            timestamp=_utc_timestamp(),
            tool_name=tool_name,
            agent=resolved_agent,
            args=args,
            context=context,
            evaluation=evaluation,
            status=status,
            reason=evaluation.reason,
            duration_ms=_duration_ms(started_at),
        )
        return ToolExecutionResult(
            ok=True,
            decision=evaluation.decision,
            status=status,
            reason=evaluation.reason,
            tool_name=tool_name,
            agent=resolved_agent,
            executed=True,
            result=result,
            observed_decision=evaluation.observed_decision,
            effective_decision=evaluation.decision,
            enforcement_mode=evaluation.enforcement_mode,
            observe_mode=evaluation.enforcement_mode == "observe",
            shadow=evaluation.enforcement_mode == "observe",
            matched_policy_id=evaluation.matched_policy_id,
        )

    def _append_audit_event(
        self,
        *,
        timestamp: str,
        tool_name: str,
        agent: str,
        args: dict[str, Any],
        context: dict[str, Any] | None,
        evaluation: PolicyEvaluationResult,
        status: str,
        reason: str,
        duration_ms: int,
        error: str | None = None,
    ) -> None:
        event = build_audit_event(
            timestamp=timestamp,
            tool_name=tool_name,
            agent=agent,
            decision=evaluation.decision,
            status=status,
            reason=reason,
            args=args,
            context=context,
            matched_policy_id=evaluation.matched_policy_id,
            duration_ms=duration_ms,
            error=error,
            enforcement_mode=evaluation.enforcement_mode,
            observed_decision=evaluation.observed_decision,
            effective_decision=evaluation.decision,
        )
        self.audit_logger.append(event)


def _duration_ms(started_at: float) -> int:
    return round((perf_counter() - started_at) * 1000)


def _utc_timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
