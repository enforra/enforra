# Security Model

Enforra OSS is local-first enforcement.

- Policy files are local YAML.
- Enforcement is local and deterministic.
- No hosted API calls, telemetry, analytics, or remote tool execution.
- Customer app owns real tool callbacks and credentials.

Decision behavior:

- `allow` / `log_only`: pre-execution decision audit is written, then callback may run.
- `block` / `require_approval`: callback does not run (fail closed).

Audit behavior:

- Logs are written locally.
- Args/context/error messages are redacted for common secret patterns before write.
- If pre-execution audit write fails, callback is not executed.
