# Python Support Refund Agent

Small local-first Python example for the Enforra OSS Python SDK.

## Setup

Install the Enforra Python SDK from PyPI:

```bash
pip install enforra
```

Or for local development from the repository root:

```bash
python3 -m pip install -e "./packages/sdk-python[dev]"
```

## Run

```bash
python3 examples/python-support-refund-agent/example.py
python3 examples/python-support-refund-agent/example.py --observe
```

## Behavior

- Small refund is allowed and executed
- Medium refund requires approval in enforce mode
- Large refund is blocked in enforce mode
- In observe mode, all refunds execute but the result shows the observed and effective decisions
