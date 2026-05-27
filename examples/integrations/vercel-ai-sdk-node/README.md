# Vercel AI SDK Integration Pattern

Vercel AI SDK-style tool execute wrapper pattern showing Enforra policy enforcement before tool execution.

This example does not require the Vercel AI SDK, an LLM provider, or API keys. It demonstrates the integration pattern: Enforra wraps the tool execute function that would be defined in a Vercel AI SDK tool.

## Install

```bash
npm install @enforra/sdk-node
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
