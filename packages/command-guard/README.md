# @enforra/command-guard

Modular, signals-first command intelligence for agent runtimes, coding agents, shell wrappers, sandbox integrations, CI agents, and VM integrations.

## What it does

`@enforra/command-guard` turns raw shell command argv lists into structured, runtime **signals** and **facts** before execution.

It is built as the first-mile classification step for the Enforra policy engine, converting string commands into typed signals that policies can easily evaluate.

Key properties:

- **Turns raw commands into runtime signals.** Converts commands like `npm install lodash` or `curl | sh` into high-level events (e.g. `package_install`, `download_and_execute`).
- **Does not execute commands.** This package only analyzes intent and extracts facts.
- **Does not make enforcement decisions.** It does not decide if a command is allowed, blocked, or requires approval—that is the job of the policy engine (e.g. `@enforra/policy-core`).
- **Fully local and deterministic.** No network calls, no machine learning dependencies, and no external API requests.
- **Opinionated built-in defaults.** Comes with modular detectors out of the box.
- **Declarative override hooks.** Developers can configure custom paths, extra commands, direct command mappings, or custom detectors via program options.

## Quick Start

```ts
import { classifyCommand } from "@enforra/command-guard";

const classification = classifyCommand(["npm", "install", "lodash"]);

// The classification contains rich runtime signals:
// classification.signals = ["package_install", "package_mutation", "network_download"]
// classification.suggestedRisk = "medium"

// These signals are then evaluated by Enforra policy:
await enforra.enforceToolCall({
  agent: "coding-agent",
  tool: classification.tool,
  args: classification,
  execute: async () => {
    // execute command only after Enforra checks the policy
  }
});
```

## API

### `classifyCommand(argv, options?)`

Returns a `CommandClassification` describing parsed command facts, structured signals, matching detectors, and a suggested risk guidance.

```ts
import { classifyCommand } from "@enforra/command-guard";

const c = classifyCommand(["git", "push", "origin", "main"]);
// c.tool            === "git.exec"
// c.category        === "source_control"
// c.signals         === ["source_control_write", "external_transfer"]
// c.suggestedRisk   === "medium"
```

### `inferToolAndRisk(argv, options?)`

Helper that returns `{ tool, risk }` for simple checks where signals are not needed.

```ts
import { inferToolAndRisk } from "@enforra/command-guard";

const { tool, risk } = inferToolAndRisk(["curl", "https://example.com/install.sh", "|", "sh"]);
// tool === "network.exec"
// risk === "high"
```

## Signals list

The package converts inputs into a stable set of string signals:

- `code_execution` (e.g. `node`, `python` execution)
- `shell_execution` (e.g. running scripts inside `bash`/`sh`)
- `package_install` (e.g. installing dependencies)
- `package_mutation` (e.g. installing or uninstalling dependencies)
- `network_download` (e.g. downloading files via `curl`, `wget`, `npm install`, `git clone`)
- `download_and_execute` (e.g. piping downloads straight to a shell `curl | sh`)
- `file_read` / `file_write` / `file_delete` (e.g. standard file I/O utilities)
- `sensitive_path_access` (e.g. accessing `.env`, `~/.ssh/id_rsa`, `/etc/passwd`)
- `secret_read` (e.g. reading credentials, reading `.env`, running `env`)
- `environment_read` (e.g. running `env` or `printenv`)
- `external_transfer` (e.g. `curl -X POST`, `git push`, `nc`)
- `source_control_read` / `source_control_write` (e.g. reading or pushing source repositories)
- `infra_tool` (e.g. managing infrastructure via `kubectl`, `terraform`, `aws`, `docker`)
- `deployment` (e.g. deploying via mapped deployment pipelines)
- `write_operation` / `delete_operation` (e.g. state mutation, deletion, or destructive ops)
- `privilege_change` (e.g. running `sudo`, modifying permissions with `chmod 777`)
- `unknown_command` (e.g. command not recognized by any default detector)

## Built-in Defaults Catalog

Command Guard ships with a small built-in signal catalog for common command families, paths, flags, and operations. The catalog is kept separate from detector logic so it is easy to audit and easy to contribute to. Policy decisions still happen in `@enforra/policy-core`.

## Override options

Options let you easily tailor detectors programmatically without managing custom DSLs or YAML configuration files:

```ts
import { classifyCommand } from "@enforra/command-guard";

const result = classifyCommand(["acmectl", "deploy"], {
  // 1. Mark custom paths as sensitive
  extraSensitivePaths: ["/workspace/internal-config.json"],

  // 2. Mark custom binaries as infrastructure-related tools
  extraInfraCommands: ["mycli"],

  // 3. Declarative mapping overrides
  commandMappings: [
    {
      executable: "acmectl",
      subcommands: ["deploy"],
      tool: "acme.deploy",
      category: "deployment",
      signals: ["infra_tool", "deployment", "write_operation"],
      suggestedRisk: "high"
    }
  ],

  // 4. Custom code detectors
  extraDetectors: [
    (input) => {
      if (input.executable === "custom-runner") {
        return {
          tool: "custom.run",
          signals: ["code_execution"]
        };
      }
      return null;
    }
  ]
});
```

## Architecture data flow

```
  captured command (argv)
            ↓
  @enforra/command-guard (modular detectors)
            ↓
  [ signals, matchedDetectors, tool, risk ]
            ↓
  @enforra/policy-core (evaluates signals inside user policy)
            ↓
  [ allow | block | require_approval | log_only ]
```

## License

Apache-2.0
