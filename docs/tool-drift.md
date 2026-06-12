# Tool Baseline Drift Detection

Enforra can record an approved baseline of your MCP tools and agent tools, then detect changes in schema, permissions, capabilities, endpoints, or risk before those tools are used again.

This is concrete tool drift detection from local manifests. It does not analyze model behavior, reasoning, or LLM outputs.

## How it works

1. You export a **tool manifest** — a JSON file listing your tools, their schemas, permissions, capabilities, and endpoints.
2. You run `enforra drift baseline` to record an approved snapshot.
3. Later, you run `enforra drift check` to compare the current manifest against the baseline.
4. Enforra reports any changes with severity classification.

## Tool manifest format

The tool manifest is a JSON file with a `tools` array:

```json
{
  "tools": [
    {
      "name": "filesystem.read",
      "description": "Read a file from the local filesystem",
      "inputSchema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      },
      "permissions": ["read"],
      "capabilities": ["filesystem"],
      "endpoint": "local://filesystem"
    }
  ]
}
```

Each tool must have a `name`. All other fields are optional but recommended for richer drift detection.

## Commands

### Record a baseline

```bash
enforra drift baseline --tools tools.json
```

This writes a baseline to `.enforra/tool-baseline.json` by default.

Options:

- `--tools` (required): Path to the tool manifest JSON file.
- `--out`: Custom output path for the baseline file. Default: `.enforra/tool-baseline.json`.

### Check for drift

```bash
enforra drift check --tools tools.json
```

Options:

- `--tools` (required): Path to the current tool manifest JSON file.
- `--baseline`: Path to the baseline file. Default: `.enforra/tool-baseline.json`.
- `--format`: Output format. One of `text`, `json`, `markdown`. Default: `text`.
- `--fail-on`: Minimum severity that causes a non-zero exit code. One of `none`, `low`, `medium`, `high`. Default: `medium`.

## Drift types detected

| Drift type             | Severity | What it means                                       |
| ---------------------- | -------- | --------------------------------------------------- |
| `permissions_changed`  | High     | Tool permissions have changed                       |
| `capabilities_changed` | High     | Tool capabilities have changed                      |
| `endpoint_changed`     | High     | Tool endpoint has changed                           |
| `tool_removed`         | High     | A tool was in the baseline but is no longer present |
| `schema_changed`       | Medium   | The input schema has changed                        |
| `description_changed`  | Low      | The description has changed                         |
| `tool_added`           | Low      | A new tool appeared that was not in the baseline    |

## Severity and exit codes

The `--fail-on` flag controls when the check command exits with a non-zero code:

| `--fail-on` | Exits non-zero when                                  |
| ----------- | ---------------------------------------------------- |
| `none`      | Never (always exits 0 unless a command error occurs) |
| `low`       | Any drift is detected                                |
| `medium`    | Medium or high severity drift is detected            |
| `high`      | Only high severity drift is detected                 |

Default: `medium`.

## Capability inference

Explicitly declared tool capabilities are the preferred source of truth in Enforra.

If a tool does not explicitly declare capabilities in the manifest, Enforra heuristically guesses capabilities from tool names and descriptions as a best-effort fallback hint. For example, a tool named `terminal.run` is guessed to have the `shell` capability.

Users and contributors should explicitly declare custom capabilities on tools instead of relying on built-in regex guesses, as inferred capabilities are best-effort hints only and should not be treated as authoritative security boundaries.

Inferred capabilities are stored in the baseline for reference, but explicit capability declarations always override and take precedence over these heuristic hints.

## CI usage

```bash
# Record baseline once
enforra drift baseline --tools tools.json

# Check on every CI run
enforra drift check --tools tools.json --fail-on medium --format json
```

## Limitations

- Drift detection is local-only. It compares a local manifest against a local baseline file.
- It does not monitor live MCP servers or remote tool registries.
- It does not analyze tool behavior or outputs — only tool definitions.
- Capability inference is heuristic-based and may not capture all capabilities.
