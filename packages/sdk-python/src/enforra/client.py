from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Generic, Literal, TypeVar

from .audit import LocalAuditLogger, build_audit_event, redact_error_message
from .policy import Decision, PolicyEvaluationResult, evaluate_policy, load_policy_file

T = TypeVar("T")


@dataclass
class ToolExecutionResult(Generic[T]):
    """Structured result that preserves execution and audit outcomes separately."""

    ok: bool
    decision: Decision
    status: Literal["executed", "logged", "blocked", "pending_approval", "failed"]
    reason: str
    tool_name: str
    agent: str
    executed: bool
    result: T | None = None
    error: str | None = None
    audit_failed: bool = False
    audit_error: str | None = None
    observed_decision: Decision | None = None
    effective_decision: Decision | None = None
    enforcement_mode: Literal["enforce", "observe"] = "enforce"
    observe_mode: bool = False
    shadow: bool = False
    matched_policy_id: str | None = None


class EnforraClient:
    """Evaluate policy, record evidence, and execute allowed local tool handlers."""

    def __init__(
        self,
        *,
        policy_path: str | Path,
        audit_path: str | Path = ".enforra/audit.jsonl",
        agent: str | None = None,
        audit_logger: LocalAuditLogger | None = None,
    ) -> None:
        self.policy_path = str(policy_path)
        self.policy_file = load_policy_file(policy_path)
        self.audit_logger = audit_logger or LocalAuditLogger(audit_path)
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
        """Enforce one tool call and run the handler only when policy permits it."""
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
            audit_error = self._try_append_audit_event(
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
            return self._result(
                ok=False,
                evaluation=evaluation,
                status="blocked",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=False,
                audit_error=audit_error,
            )

        if evaluation.decision == "require_approval":
            audit_error = self._try_append_audit_event(
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
            return self._result(
                ok=False,
                evaluation=evaluation,
                status="pending_approval",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=False,
                audit_error=audit_error,
            )

        decision_audit_error = self._try_append_audit_event(
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
        if decision_audit_error is not None:
            return self._result(
                ok=False,
                evaluation=evaluation,
                status="failed",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=False,
                audit_error=decision_audit_error,
            )

        try:
            result = handler()
        except Exception as error:
            error_message = str(error)
            audit_error = self._try_append_audit_event(
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
            return self._result(
                ok=False,
                evaluation=evaluation,
                status="failed",
                reason=evaluation.reason,
                tool_name=tool_name,
                agent=resolved_agent,
                executed=True,
                error=error_message,
                audit_error=audit_error,
            )

        status: Literal["executed", "logged"] = (
            "logged" if evaluation.decision == "log_only" else "executed"
        )
        audit_error = self._try_append_audit_event(
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
        return self._result(
            ok=audit_error is None,
            evaluation=evaluation,
            status=status,
            reason=evaluation.reason,
            tool_name=tool_name,
            agent=resolved_agent,
            executed=True,
            result=result,
            audit_error=audit_error,
        )

    def _result(
        self,
        *,
        ok: bool,
        evaluation: PolicyEvaluationResult,
        status: Literal["executed", "logged", "blocked", "pending_approval", "failed"],
        reason: str,
        tool_name: str,
        agent: str,
        executed: bool,
        result: T | None = None,
        error: str | None = None,
        audit_error: str | None = None,
    ) -> ToolExecutionResult[T]:
        """Build a consistent result from policy, execution, and audit state."""
        return ToolExecutionResult(
            ok=ok,
            decision=evaluation.decision,
            status=status,
            reason=reason,
            tool_name=tool_name,
            agent=agent,
            executed=executed,
            result=result,
            error=error,
            audit_failed=audit_error is not None,
            audit_error=audit_error,
            observed_decision=evaluation.observed_decision,
            effective_decision=evaluation.decision,
            enforcement_mode=evaluation.enforcement_mode,
            observe_mode=evaluation.enforcement_mode == "observe",
            shadow=evaluation.enforcement_mode == "observe",
            matched_policy_id=evaluation.matched_policy_id,
        )

    def _try_append_audit_event(
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
    ) -> str | None:
        """Append an audit event and return a redacted error instead of raising."""
        try:
            self._append_audit_event(
                timestamp=timestamp,
                tool_name=tool_name,
                agent=agent,
                args=args,
                context=context,
                evaluation=evaluation,
                status=status,
                reason=reason,
                duration_ms=duration_ms,
                error=error,
            )
        except Exception as audit_error:
            return redact_error_message(str(audit_error))
        return None

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
