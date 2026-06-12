# Audit Reporting

`enforra report` turns a local Enforra JSONL audit log into a readable summary.

It reads the audit file from disk, summarizes what agents attempted, which tools were evaluated, what decisions were returned, and which policies matched when that field is present. It does not send data anywhere and does not require Enforra Cloud.

Audit reports are useful for local development, PR evidence, and design partner evaluation. They are not compliance reports and do not replace hosted dashboards, centralized audit retention, or approval workflows.

## Default Report

By default, the command reads `.enforra/audit.jsonl` and prints text:

```bash
npx enforra report
```

Use a custom audit path:

```bash
npx enforra report --audit .enforra/audit.jsonl
```

## Output Formats

Text is the default format:

```bash
npx enforra report --audit .enforra/audit.jsonl
```

JSON output is intended for scripts and local automation:

```bash
npx enforra report --audit .enforra/audit.jsonl --format json
```

Markdown output is suitable for pasting into an issue, PR, or security review:

```bash
npx enforra report --audit .enforra/audit.jsonl --format markdown
```

## Filters

Filter by decision:

```bash
npx enforra report --decision block
```

Other filters:

```bash
npx enforra report --agent coding-agent
npx enforra report --tool terminal.run
npx enforra report --since 2026-06-12T10:30:00Z
```

Supported decisions are `allow`, `block`, `require_approval`, and `log_only`.

If a field is absent from an audit event, the report handles it gracefully. For example, Node audit events use `tool` and `matchedPolicyId`, while Python audit events use `tool_name` and `matched_policy_id`.

## Safety

The report only includes safe event fields:

- `timestamp`
- `agent`
- `tool`
- `decision`
- matched policy ID when present
- `reason` when present
- `status` when present

It does not print raw arguments. Existing audit redaction is preserved, and report text fields are defensively redacted for common token and secret patterns.

Malformed JSONL lines are skipped and counted in the report. If the audit file does not exist, the command prints a clear error and exits nonzero.
