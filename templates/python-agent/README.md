# Enforra Python Agent Starter Template

This template demonstrates how to protect generic tool execution in a Python application.

## Setup

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

This installs the public `enforra` package from PyPI.

## Run

Run the agent script:

```bash
python agent.py
```

You should see:

- Small Refund ($25) executes successfully.
- Medium Refund ($150) throws an exception indicating it requires approval.
- Large Refund ($800) throws an exception indicating it is blocked.

The events are written to `.enforra/audit.jsonl`.

## Policy Testing

Test the policy rules using the Enforra CLI tool (available via npm/npx):

```bash
npx @enforra/cli test --policy policy.yaml --cases policy-cases.yaml
```
