# Demo: Tool Baseline Drift Detection

This demo showcases how Enforra CLI detects changes in schema, permissions, capabilities, endpoints, or risk from local manifests before tools are executed.

## Setup

First, ensure the project is built:

```bash
pnpm build
```

## Scenarios

We have two tool manifests:

- `tools-approved.json`: The authorized tool baseline representing trusted tool definitions.
- `tools-current.json`: The current tool definitions, showing three types of drift:
  1. **New Tool**: `terminal.run` (new shell execution tool).
  2. **Sensitive Argument**: `filesystem.read` gains a `sudo` parameter.
  3. **Risk Tag**: `database.query` declares a `production-risk` capability.

## Running the Demo

### 1. Record the Approved Baseline

Generate a tool baseline snapshot from the approved definitions (writes to `.enforra/tool-baseline.json` by default):

```bash
node packages/cli/dist/cli.js drift baseline --tools examples/demos/tool-drift/tools-approved.json
```

### 2. Run Clean Check

Checking the approved manifest against its own baseline will report no drift:

```bash
node packages/cli/dist/cli.js drift check --tools examples/demos/tool-drift/tools-approved.json
```

Output:

```
Enforra drift check
Baseline file: .enforra/tool-baseline.json
Tools file: examples/demos/tool-drift/tools-approved.json
Checked at: ...
Total tools: 2 (Baseline: 2)

No drift detected.
```

### 3. Detect Drift

Check the current manifest against the baseline:

```bash
node packages/cli/dist/cli.js drift check --tools examples/demos/tool-drift/tools-current.json
```

This will report:

- `[HIGH] terminal.run: tool_added` (new tool with high-risk shell capabilities)
- `[MEDIUM] filesystem.read: schema_changed` (gained `sudo` option)
- `[HIGH] database.query: capabilities_changed` (gained `production-risk` capability)

### 4. Output Formats

You can export findings in JSON or Markdown format:

```bash
node packages/cli/dist/cli.js drift check --tools examples/demos/tool-drift/tools-current.json --format json
node packages/cli/dist/cli.js drift check --tools examples/demos/tool-drift/tools-current.json --format markdown
```
