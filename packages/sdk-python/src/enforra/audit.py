from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .policy import Decision

REDACTED_VALUE = "[REDACTED]"

SENSITIVE_FRAGMENTS = (
    "token",
    "secret",
    "api_key",
    "apikey",
    "password",
    "private_key",
    "privatekey",
    "authorization",
    "cookie",
    "client_secret",
    "access_token",
    "refresh_token",
)

ERROR_REDACTION_PATTERNS = (
    re.compile(r"\bBearer\s+[-._~+/A-Za-z0-9]+=*", re.IGNORECASE),
    re.compile(
        r"\b(token|api_key|apikey|authorization|password|secret)=([^&\s]+)",
        re.IGNORECASE,
    ),
    re.compile(r"\bsk_[A-Za-z0-9_=-]+"),
)


@dataclass(frozen=True)
class AuditEvent:
    timestamp: str
    agent: str
    tool_name: str
    decision: Decision
    status: str
    reason: str
    args_redacted: Any
    context_redacted: Any = None
    matched_policy_id: str | None = None
    error: str | None = None
    duration_ms: int | None = None
    enforcement_mode: str | None = None
    observed_decision: Decision | None = None
    effective_decision: Decision | None = None
    shadow: bool | None = None
    observe_mode: bool | None = None


class LocalAuditLogger:
    """Append redacted audit events to a local JSONL file."""

    def __init__(self, path: str | Path = ".enforra/audit.jsonl") -> None:
        self.path = Path(path)

    def append(self, event: AuditEvent) -> AuditEvent:
        """Persist one audit event and return the event that was written."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(asdict(event), separators=(",", ":")) + "\n")
        return event


def redact_payload(value: Any) -> Any:
    """Recursively redact values whose keys look sensitive."""
    if isinstance(value, dict):
        return {
            key: REDACTED_VALUE if _should_redact_key(key) else redact_payload(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [redact_payload(item) for item in value]
    if isinstance(value, tuple):
        return [redact_payload(item) for item in value]
    return value


def redact_error_message(message: str) -> str:
    """Redact common credential forms from an exception or audit error string."""
    redacted = message
    for pattern in ERROR_REDACTION_PATTERNS:
        if pattern.groups:
            redacted = pattern.sub(lambda match: f"{match.group(1)}={REDACTED_VALUE}", redacted)
        else:
            redacted = pattern.sub(REDACTED_VALUE, redacted)
    return redacted


def build_audit_event(
    *,
    timestamp: str,
    agent: str,
    tool_name: str,
    decision: Decision,
    status: str,
    reason: str,
    args: dict[str, Any],
    context: dict[str, Any] | None,
    matched_policy_id: str | None,
    duration_ms: int | None,
    error: str | None,
    enforcement_mode: str | None,
    observed_decision: Decision | None,
    effective_decision: Decision | None,
) -> AuditEvent:
    """Build a normalized audit event with payload and error redaction applied."""
    observe_mode = enforcement_mode == "observe"
    return AuditEvent(
        timestamp=timestamp,
        agent=agent,
        tool_name=tool_name,
        decision=decision,
        status=status,
        reason=reason,
        args_redacted=redact_payload(args),
        context_redacted=redact_payload(context) if context is not None else None,
        matched_policy_id=matched_policy_id,
        error=redact_error_message(error) if error is not None else None,
        duration_ms=duration_ms,
        enforcement_mode=enforcement_mode,
        observed_decision=observed_decision,
        effective_decision=effective_decision,
        shadow=True if observe_mode else None,
        observe_mode=True if observe_mode else None,
    )


def _should_redact_key(key: str) -> bool:
    normalized = key.replace("-", "_").replace(" ", "_").lower()
    return any(fragment in normalized for fragment in SENSITIVE_FRAGMENTS)
