# Vercel AI SDK Integration

This doc shows how to use Enforra to enforce policies on tools defined using the Vercel AI SDK's `tool` abstraction.

## What This Integration Shows

The Vercel AI SDK defines tools using `tool()` helper with a schema and an `execute` function. Enforra wraps the tool's `execute` callback body so that policy is evaluated **before** the side-effect callback runs. The AI SDK continues to plan and call tools as usual.

## Install

```bash
npm install @enforra/sdk-node ai zod
```

## Where Enforra Sits

```
Vercel AI SDK → Calls tool.execute() → Enforra evaluates policy → Execute body (if allowed)
```

## Example Code

```typescript
import { createEnforraClient } from "@enforra/sdk-node";
import { tool } from "ai";
import { z } from "zod";

const enforra = await createEnforraClient({
  policyPath: "./policy.yaml",
  auditPath: ".enforra/audit.jsonl",
  agent: "coding-agent"
});

// Define Vercel AI SDK tool with Enforra wrapper inside execute
const filesystemRead = tool({
  description: "Read a file from the filesystem",
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    return enforra.enforceToolCall({
      agent: "coding-agent",
      tool: "filesystem.read",
      args: { path },
      context: { environment: "development" },
      execute: async () => ({ content: "// application code" })
    });
  }
});
```

## Run the Example

```bash
cd examples/integrations/vercel-ai-sdk-node
npm install
npm start
```

## Expected Output

- Safe file read → **allow**, executed
- `.env` file read → **block**, not executed
- Terminal command → **require_approval**, not executed
- Small refund → **allow**, executed
- Large refund → **block**, not executed

## Audit Log

Written to `examples/integrations/vercel-ai-sdk-node/.enforra/audit.jsonl`.

## What Is Not Included

- Real Vercel AI SDK dependency or model execution
- LLM provider API keys
- Network calls

See the [example directory](../../examples/integrations/vercel-ai-sdk-node/) for full runnable code.
