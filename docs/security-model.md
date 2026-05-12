# Security Model

Enforra open source core is a local enforcement library.

- No hosted API is required.
- No secrets are required by Enforra.
- No remote tool execution is implemented.
- No telemetry or analytics are sent.
- Audit logs are written locally.
- Common secret fields are recursively redacted before audit events are written.

The application remains responsible for tool implementation, authentication to external services, secret storage, and any real approval workflow.
