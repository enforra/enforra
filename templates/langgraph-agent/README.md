# Enforra LangGraph Agent Starter Template

This template demonstrates how to protect LangGraph tool execution using the public `enforra` package from PyPI.

_Note: This template runs entirely locally and uses a mock graph execution flow. It does not require any OpenAI/Anthropic API keys._

## Setup

Create a virtual environment and install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

Run the agent script:

```bash
python agent.py
```

You should see:

- `read_file` for safe path completes successfully.
- `read_file` for `.env` is blocked and fails before execution.
- `run_command` requires approval and fails before execution.

The event log is written locally to `.enforra/audit.jsonl`.

## Policy Testing

Test the policy rules using the Enforra CLI tool (available via npm/npx):

```bash
npx @enforra/cli test --policy policy.yaml --cases policy-cases.yaml
```
