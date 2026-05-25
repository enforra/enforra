# enforra

Local-first Python SDK for Enforra OSS.

## Install

From this repository:

```bash
python3 -m pip install -e ".[dev]"
```

## Usage

```python
from enforra import EnforraClient

client = EnforraClient(
    policy_path="policies/starter/support-agent.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="support-agent",
)

result = client.run_tool(
    tool_name="stripe.refund",
    args={"amount": 75, "customer_id": "cus_123"},
    handler=lambda: {"refund_id": "ref_123", "status": "succeeded"},
    context={"environment": "production"},
)
```

## Features

- Load local YAML policies with `version: 1`
- Evaluate `allow`, `block`, `require_approval`, and `log_only`
- Support observe mode via `mode: observe` or `observe_only: true`
- Write local JSONL audit events with redacted args and context
- Provide a sync, typed `EnforraClient.run_tool(...)` API

## Supported Policy Fields

- `version`
- `mode`
- `observe_only`
- `defaults.decision`
- `policies[].id`
- `policies[].priority`
- `policies[].match.agent`
- `policies[].match.tool`
- `policies[].decision`
- `policies[].conditions`

## Supported Condition Operators

- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`
- `contains`
- `not_contains`

Conditions can be expressed as:

- A flat list where every condition must pass
- `all` groups
- `any` groups
- Combined `all` and `any` groups

## Observe Mode

In observe mode, matched `block` and `require_approval` decisions are shadowed to an effective
decision of `allow`. The audit log includes:

- `enforcement_mode`
- `observed_decision`
- `effective_decision`
- `shadow`
- `observe_mode`

## Development

```bash
python3 -m pytest
```
