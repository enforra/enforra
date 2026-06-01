import { generateText, tool } from "ai";
import { MockLanguageModelV1 } from "ai/test";
import { createEnforraClient } from "@enforra/sdk-node";
import { z } from "zod";
// 1. Initialize Enforra client loaded with our local policy
const client = await createEnforraClient({
    policyPath: "./policy.yaml",
    agent: "coding-agent"
});
// 2. Define tools using Vercel AI SDK and wrap their execution in Enforra
const filesystemRead = tool({
    description: "Read a file from the filesystem",
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => {
        return client.enforceToolCall({
            agent: "coding-agent",
            tool: "filesystem.read",
            args: { path },
            execute: async () => {
                console.log(`[FS API] Actually reading file: ${path}`);
                return { content: "// source code content" };
            }
        });
    }
});
const terminalRun = tool({
    description: "Run a command in the terminal",
    parameters: z.object({ command: z.string() }),
    execute: async ({ command }) => {
        return client.enforceToolCall({
            agent: "coding-agent",
            tool: "terminal.run",
            args: { command },
            execute: async () => {
                console.log(`[Terminal API] Actually running command: ${command}`);
                return { exitCode: 0, stdout: "success" };
            }
        });
    }
});
// Helper function to run the model with a mocked tool call response
async function runWithMockToolCall(toolName, args) {
    const mockModel = new MockLanguageModelV1({
        defaultObjectGenerationMode: "json",
        doGenerate: async () => ({
            toolCalls: [
                {
                    toolCallType: "function",
                    toolCallId: "call-" + Math.random().toString(36).substring(7),
                    toolName,
                    args: JSON.stringify(args)
                }
            ],
            finishReason: "tool-calls",
            usage: { promptTokens: 5, completionTokens: 10 },
            rawCall: { rawPrompt: null, rawSettings: {} }
        })
    });
    return generateText({
        model: mockModel,
        tools: {
            "filesystem.read": filesystemRead,
            "terminal.run": terminalRun
        },
        maxSteps: 2,
        prompt: `Execute: ${toolName} with ${JSON.stringify(args)}`
    });
}
// 3. Run scenarios demonstrating Allow, Block, and Require Approval
async function main() {
    console.log("--- Scenario 1: Safe File Read (Allowed) ---");
    try {
        const result = await runWithMockToolCall("filesystem.read", { path: "src/index.ts" });
        const fsResult = result.toolResults[0].result;
        console.log(`Tool Result Decision: ${fsResult.decision}`);
        console.log(`Tool Result Executed: ${fsResult.executed ? "yes" : "no"}`);
        if (fsResult.ok) {
            console.log(`Tool Output:`, fsResult.data);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Agent failed / blocked:", message);
    }
    console.log("\n--- Scenario 2: Sensitive File Read (Blocked) ---");
    try {
        const result = await runWithMockToolCall("filesystem.read", { path: "/workspace/.env" });
        const fsResult = result.toolResults[0].result;
        console.log(`Tool Result Decision: ${fsResult.decision}`);
        console.log(`Tool Result Executed: ${fsResult.executed ? "yes" : "no"}`);
        if (fsResult.reason) {
            console.log(`Block Reason: ${fsResult.reason}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Agent failed / blocked:", message);
    }
    console.log("\n--- Scenario 3: Terminal command execution (Requires Approval) ---");
    try {
        const result = await runWithMockToolCall("terminal.run", { command: "npm install express" });
        const termResult = result.toolResults[0].result;
        console.log(`Tool Result Decision: ${termResult.decision}`);
        console.log(`Tool Result Executed: ${termResult.executed ? "yes" : "no"}`);
        if (termResult.reason) {
            console.log(`Approval Reason: ${termResult.reason}`);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Agent failed / blocked:", message);
    }
}
main().catch(console.error);
