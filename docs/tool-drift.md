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
enforra drift check --tools tools.json --risk-profile examples/demos/tool-drift/risk-profile.json
```

Options:

- `--tools` (required): Path to the current tool manifest JSON file.
- `--baseline`: Path to the baseline file. Default: `.enforra/tool-baseline.json`.
- `--format`: Output format. One of `text`, `json`, `markdown`. Default: `text`.
- `--fail-on`: Minimum severity that causes a non-zero exit code. One of `none`, `low`, `medium`, `high`. Default: `medium`.
- `--risk-profile`: Path to a risk profile JSON file to classify drift severity.
- `--lint-rules`: Path to a rules JSON file to perform heuristic capability checks and detect metadata mismatches.

## Drift types detected

| Drift type                     | Severity (with Risk Profile) | What it means                                                                    |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------------------------- |
| `permissions_expanded`         | High                         | Tool permissions have been added                                                 |
| `capabilities_expanded`        | High                         | Tool capabilities have been added                                                |
| `capability_metadata_mismatch` | High                         | Tool name suggests a capability that declarations omit (requires `--lint-rules`) |
| `endpoint_changed`             | High                         | Tool endpoint has changed                                                        |
| `removed_tool`                 | High                         | A tool was in the baseline but is no longer present                              |
| `schema_changed`               | Medium                       | The input schema has changed                                                     |
| `description_changed`          | Low                          | The description has changed                                                      |
| `new_tool`                     | Low                          | A new tool appeared that was not in the baseline                                 |

## Severity and exit codes

The `--fail-on` flag controls when the check command exits with a non-zero code. This requires `--risk-profile` to be supplied, otherwise all findings are unclassified and will not trigger a failure exit code under standard severity rules.

| `--fail-on` | Exits non-zero when                                  |
| ----------- | ---------------------------------------------------- |
| `none`      | Never (always exits 0 unless a command error occurs) |
| `low`       | Any drift is detected                                |
| `medium`    | Medium or high severity drift is detected            |
| `high`      | Only high severity drift is detected                 |

Default: `medium`.

## Pure Manifest-Based Drift Detection

Drift core is manifest-based. Severity is applied through a risk profile. Enforra includes example starter profiles, but teams should define their own capabilities, permissions, and risk tags.

By default, Enforra drift core is neutral and does not ship with any default risk model. Severity classification and metadata capability linting are strictly opt-in:

- **Severity** is only classified if a `--risk-profile <path>` is provided.
- **Metadata capability mismatches** are only linted if a `--lint-rules <path>` file is provided.

### Example Starter Files

Enforra includes starter examples for rules and risk profiles under `examples/demos/tool-drift/`:

- `examples/demos/tool-drift/risk-profile.json`
- `examples/demos/tool-drift/metadata-lint-rules.json`

## Risk Profile Configuration

A risk profile defines which capabilities, risk tags, and permissions are considered high-risk, and maps each drift type to a severity:

```json
{
  "highRiskCapabilities": ["shell", "delete", "network"],
  "highRiskRiskTags": ["production"],
  "highRiskPermissions": ["admin"],
  "driftSeverities": {
    "permissions_expanded": "high",
    "capabilities_expanded": "high",
    "removed_tool": "high",
    "schema_changed": "medium"
  }
}
```

If a risk profile is provided, the severity will be classified based on these settings. Without a risk profile, drift findings are returned with no assigned severity.

## Heuristic Metadata Linting

If `--lint-rules <path>` is passed, Enforra performs a best-effort heuristic check comparing declared capabilities against tool names and descriptions using the provided regex patterns.

For example, using `examples/demos/tool-drift/metadata-lint-rules.json`:

- `terminal.run` with `capabilities: ["read"]` → `capability_metadata_mismatch` (name suggests `shell`)
- `terminal.run` with `capabilities: ["read", "shell"]` → No mismatch
- `calculator.add` with `capabilities: ["read"]` → No mismatch (benign name)

## CI usage

```bash
# Record baseline once
enforra drift baseline --tools tools.json

# Check on every CI run using the starter risk profile
enforra drift check --tools tools.json --risk-profile examples/demos/tool-drift/risk-profile.json --fail-on medium --format json
```

## Limitations

- Drift detection is local-only. It compares a local manifest against a local baseline file.
- It does not monitor live MCP servers or remote tool registries.
- It does not analyze tool behavior or outputs — only tool definitions.
- Capability inference is heuristic-based and may not capture all capabilities.
