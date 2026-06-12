# Enforra Cross-Framework Governance Demo

This demo showcases a single local-first Enforra policy file applied consistently across three different AI agent frameworks:

- **Vercel AI SDK** (JavaScript/TypeScript)
- **LangGraph** (Python)
- **OpenAI Agents SDK** (Python)

## What this Demo Proves

1. **Frameworks decide when to call tools:** The tools are defined within each framework using their own idiomatic syntax (`tool` function in Vercel AI SDK, `@tool` decorator in LangGraph, and `function_tool` in OpenAI Agents SDK).
2. **Enforra applies policy before the tool callback runs:** Each tool wraps its actual implementation with Enforra client enforcement. If the policy rejects a tool call, the tool's core logic is blocked from executing.
3. **The caller owns execution:** Enforra does not invoke the tools itself. Instead, it acts as a gatekeeper that decides whether to allow, block, log_only, or require approval, letting the framework/caller execute the allowed callback.
4. **The decision is consistent across frameworks:** All three frameworks evaluate the same policy file and reach identical governance decisions for every scenario.

## Policy Scenarios & Expected Decisions

The shared policy file `policies/starter/cross-framework.yaml` implements the following rules:

| Scenario / Target     | Tool                  | Rule & Conditions               | Expected Decision  |
| --------------------- | --------------------- | ------------------------------- | ------------------ |
| Safe File Read        | `filesystem.read`     | Path does not contain `.env`    | `allow`            |
| Forbidden File Read   | `filesystem.read`     | Path contains `.env`            | `block`            |
| Terminal Command      | `terminal.run`        | Always requires approval        | `require_approval` |
| GitHub Issue Creation | `github.create_issue` | Audited/logged without blocking | `log_only`         |
| Small Refund          | `support.refund`      | Amount <= $50                   | `allow`            |
| Large Refund          | `support.refund`      | Amount > $50                    | `block`            |

## How to Run

Run the demo from the workspace root:

```bash
pnpm demo:cross-framework
```

To run the simulator-based policy unit tests:

```bash
pnpm policy:test:cross-framework
```

## Logs

Audit logs from all frameworks are written to a unified audit log:

- `examples/demos/cross-framework-governance/.enforra/audit.jsonl`
