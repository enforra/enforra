# Enforra Integration Examples

This directory contains standalone, runnable examples of Enforra integrated into common AI agent frameworks.

## Examples

- **[Vercel AI SDK (Node.js)](vercel-ai-sdk-node/)**: Demonstrates tool call intercept and policy evaluation using JavaScript/TypeScript.
- **[LangGraph (Python)](langgraph-python/)**: Integrates Enforra policy client directly into a LangGraph `ToolNode` tool callback.
- **[OpenAI Agents SDK (Python)](openai-agents-python/)**: Wraps agent function tools with Enforra policies before registering them.
- **[CrewAI (Python)](crewai-python/)**: Design pattern for tool call enforcement in CrewAI.
- **[AutoGen (Python)](autogen-python/)**: Design pattern for tool call enforcement in AutoGen.

## Cross-Framework Governance Demo

For a unified example running all frameworks simultaneously against a single policy file, see **[Cross-Framework Governance Demo](../demos/cross-framework-governance/)**. This demo shows one shared policy file enforcing the same decisions across Vercel AI SDK, LangGraph, and OpenAI Agents SDK style tool calls.
