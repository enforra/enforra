# Vercel AI SDK Integration Example

Real package integration using the actual Vercel AI SDK `ai` and `zod` libraries to define tools wrapped with Enforra policies.

This example runs entirely locally, requires no LLM provider, and requires no API keys. It uses the real Vercel AI SDK `tool` helper to define tools and shows Enforra evaluating policy inside the tool's execution callback.

## Install

```bash
npm install @enforra/sdk-node ai zod
```

## Run

From the example directory:

```bash
cd examples/integrations/vercel-ai-sdk-node
npm install
npm start
```

## Expected Output

```
--- Tool: filesystem.read ---
Decision: allow
Executed: yes

--- Tool: filesystem.read ---
Decision: block
Executed: no

--- Tool: terminal.run ---
Decision: require_approval
Executed: no

--- Tool: support.refund ---
Args: {"amount":25}
Decision: allow
Executed: yes

--- Tool: support.refund ---
Args: {"amount":500}
Decision: block
Executed: no
```

## Audit Log

Written to `examples/integrations/vercel-ai-sdk-node/.enforra/audit.jsonl`.

## What This Shows

- A safe file read is **allowed** and executes
- Reading `.env` is **blocked** by policy
- Running a terminal command **requires approval**
- A small refund is **allowed**
- A large refund is **blocked**

## What Is Not Included

- Real Vercel AI SDK dependency or model execution
- LLM provider API keys
- Network calls
