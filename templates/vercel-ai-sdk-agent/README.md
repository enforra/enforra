# Enforra Vercel AI SDK Agent Template

This is a copyable starter template demonstrating how to secure Vercel AI SDK tools using Enforra policies before tool execution.

This template uses a Mock Language Model from the Vercel AI SDK so that you can run it locally without requiring external OpenAI or Anthropic API keys.

## Setup & Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the TypeScript code:

   ```bash
   npm run build
   ```

3. Run the agent:

   ```bash
   npm start
   ```

4. Run the policy test cases:
   ```bash
   npm run test:policy
   ```

## How it works

1. **Policy Definition (`policy.yaml`)**:
   Defines which tool calls are allowed, blocked, or require approval.
2. **Policy Verification (`policy-cases.yaml`)**:
   Contains expected test inputs and assertions that run via `@enforra/cli`.
3. **Execution (`src/index.ts`)**:
   - Initializes `createEnforraClient` with the local policy path.
   - Defines two Vercel AI SDK tools (`filesystem.read` and `terminal.run`) using `tool()`.
   - Wraps their execution callback with `client.enforceToolCall`.
   - Simulates tool calls using `generateText` and a mocked model.
4. **Audit Logging**:
   Policy decisions and outcomes are written to the local audit log at `.enforra/audit.jsonl`.
