# Vercel AI SDK Integration Pattern

This doc shows how to use Enforra to enforce policies on Vercel AI SDK-style tool execute functions.

## What This Pattern Shows

The Vercel AI SDK defines tools with an `execute` function. Enforra wraps the execute body so that policy is evaluated **before** the side-effect callback runs. The AI SDK continues to plan and call tools as usual.

## Install

```bash
npm install @enforra/sdk-node
```

## Where Enforra Sits

```
Vercel AI SDK → Calls tool.execute() → Enforra evaluates policy → Execute body (if allowed)
```

## Example Code

```typescript
import { createEnforraClient } from "@enforra/sdk-node";

const enforra = await createEnforraClient({
  policyPath: "./policy.yaml",
  auditPath: ".enforra/audit.jsonl",
  agent: "coding-agent"
});

// This would be a Vercel AI SDK tool execute function
const result = await enforra.enforceToolCall({
  agent: "coding-agent",
  tool: "filesystem.read",
  args: { path: "/workspace/src/app.ts" },
  context: { environment: "development" },
  execute: async () => ({ content: "// application code" })
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
