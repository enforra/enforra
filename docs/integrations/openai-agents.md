# OpenAI Agents SDK Integration Pattern

This doc shows how to use Enforra to enforce policies on tool functions that would be registered with the OpenAI Agents SDK.

## What This Pattern Shows

The OpenAI Agents SDK registers Python functions as tools for the agent to call. Enforra wraps the tool function body so that policy is evaluated **before** the side-effect callback runs. The agent continues to plan and call tools as usual.

## Install

```bash
pip install enforra
```

## Where Enforra Sits

```
OpenAI Agent → Calls tool function → Enforra evaluates policy → Tool callback (if allowed)
```

## Example Code

```python
from enforra import EnforraClient

client = EnforraClient(
    policy_path="policy.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="coding-agent",
)

# This function would be registered as an Agents SDK tool
def create_github_issue(title: str, repo: str) -> dict:
    result = client.run_tool(
        tool_name="github.create_issue",
        args={"title": title, "repo": repo},
        handler=lambda: {"issue_number": 42, "url": f"https://github.com/{repo}/issues/42"},
    )
    return {"decision": result.decision, "executed": result.executed}
```

## Run the Example

```bash
python examples/integrations/openai-agents-python/example.py
```

## Expected Output

- Safe file read → **allow**, executed
- `.env` file read → **block**, not executed
- GitHub issue creation → **require_approval**, not executed
- Small refund → **allow**, executed

## Audit Log

Written to `examples/integrations/openai-agents-python/.enforra/audit.jsonl`.

## What Is Not Included

- Real OpenAI Agents SDK dependency
- OpenAI API keys
- Network calls or model execution

See the [example directory](../examples/integrations/openai-agents-python/) for full runnable code.
