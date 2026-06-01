# Enforra Node.js Agent Starter Template

This template demonstrates how to protect generic tool execution in a Node.js TypeScript application.

## Setup

Install dependencies:

```bash
npm install
```

This installs the public `@enforra/sdk-node` package from the npm registry.

## Run

Run the agent script:

```bash
npm start
```

You should see:

- Small Refund ($25) executes successfully.
- Medium Refund ($150) throws an error indicating it requires approval.
- Large Refund ($800) throws an error indicating it is blocked.

The events are written to `.enforra/audit.jsonl`.

## Policy Testing

Test the policy rules:

```bash
npm run test:policy
```

This runs the policy simulator against `policy-cases.yaml` using the Enforra CLI, confirming expected decisions align with policy rules without running any agent loops.
