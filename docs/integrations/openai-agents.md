# OpenAI Agents SDK Integration

This doc shows how to use Enforra to enforce policies on tool functions that are registered with the OpenAI Agents SDK.

## What This Integration Shows

The OpenAI Agents SDK registers Python functions as tools (using `function_tool`) for the agent to call. Enforra wraps the tool function body so that policy is evaluated **before** the side-effect callback runs. The agent continues to plan and call tools as usual.

## Install

```bash
pip install enforra openai-agents
```

## Where Enforra Sits

```
OpenAI Agent → Calls tool function → Enforra evaluates policy → Tool callback (if allowed)
```

## Example Code

```python
from agents import function_tool
from enforra import EnforraClient

client = EnforraClient(
    policy_path="policy.yaml",
    audit_path=".enforra/audit.jsonl",
    agent="coding-agent",
)

# Define function implementation wrapped with Enforra
def create_github_issue_impl(title: str, repo: str) -> dict:
    """Create a GitHub issue."""
    result = client.run_tool(
        tool_name="github.create_issue",
        args={"title": title, "repo": repo},
        handler=lambda: {"issue_number": 42, "url": f"https://github.com/{repo}/issues/42"},
    )
    return {"decision": result.decision, "executed": result.executed, "status": result.status, "reason": result.reason}

# Register the tool with the OpenAI Agents SDK
create_github_issue = function_tool(create_github_issue_impl)
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

See the [example directory](../../examples/integrations/openai-agents-python/) for full runnable code.
