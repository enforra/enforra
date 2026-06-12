import type { ToolDefinition, BaselineTool, ToolManifest, BaselineFile } from "./types.js";
import { inferCapabilities } from "./capability-rules.js";
import { deterministicHash } from "./fingerprints.js";

/** Sanitize an endpoint string by stripping query parameters and hash components. */
export function sanitizeEndpoint(endpoint: string | undefined): string | undefined {
  if (endpoint === undefined) {
    return undefined;
  }
  try {
    const url = new URL(endpoint);
    url.search = ""; // strip query params
    url.hash = ""; // strip hash
    return url.toString();
  } catch {
    return endpoint.split(/[?#]/)[0];
  }
}

/** Normalize a tool definition for deterministic hashing and comparisons. */
export function normalizeTool(tool: ToolDefinition): ToolDefinition {
  const normalized: ToolDefinition = {
    name: tool.name
  };

  if (tool.description !== undefined) {
    normalized.description = tool.description;
  }
  if (tool.inputSchema !== undefined) {
    normalized.inputSchema = tool.inputSchema;
  }
  if (tool.permissions !== undefined) {
    normalized.permissions = [...tool.permissions].sort();
  }
  if (tool.capabilities !== undefined) {
    normalized.capabilities = [...tool.capabilities].sort();
  }
  if (tool.endpoint !== undefined) {
    normalized.endpoint = sanitizeEndpoint(tool.endpoint);
  }
  return normalized;
}

/** Validate manifest to ensure no duplicate tool names exist. */
export function validateManifest(manifest: ToolManifest): void {
  const seen = new Set<string>();
  for (const tool of manifest.tools) {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool name found in manifest: ${tool.name}`);
    }
    seen.add(tool.name);
  }
}

/** Create a baseline tool entry from a tool definition. */
export function createBaselineTool(tool: ToolDefinition): BaselineTool {
  const normalized = normalizeTool(tool);
  const entry: BaselineTool = {
    name: normalized.name,
    hash: deterministicHash({
      name: normalized.name,
      description: normalized.description,
      inputSchema: normalized.inputSchema,
      permissions: normalized.permissions,
      capabilities: normalized.capabilities,
      endpoint: normalized.endpoint
    }),
    inferredCapabilities: inferCapabilities(normalized.name, normalized.description)
  };

  if (normalized.description !== undefined) {
    entry.description = normalized.description;
  }
  if (normalized.inputSchema !== undefined) {
    entry.inputSchema = normalized.inputSchema;
  }
  if (normalized.permissions !== undefined) {
    entry.permissions = normalized.permissions;
  }
  if (normalized.capabilities !== undefined) {
    entry.capabilities = normalized.capabilities;
  }
  if (normalized.endpoint !== undefined) {
    entry.endpoint = normalized.endpoint;
  }

  return entry;
}

/** Build a baseline file object from a tool manifest. */
export function buildBaseline(manifest: ToolManifest): BaselineFile {
  validateManifest(manifest);
  const tools = manifest.tools.map(createBaselineTool).sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    toolCount: tools.length,
    tools
  };
}

/** Parse and validate a tool manifest JSON string. */
export function parseToolManifest(contents: string): ToolManifest {
  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Tool manifest must be a JSON object");
  }

  const tools = parsed["tools"];
  if (!Array.isArray(tools)) {
    throw new Error("Tool manifest must contain a 'tools' array");
  }

  for (const tool of tools) {
    if (!isRecord(tool) || typeof tool["name"] !== "string" || tool["name"].length === 0) {
      throw new Error("Each tool must have a non-empty 'name' string");
    }
  }

  const manifest = parsed as unknown as ToolManifest;
  validateManifest(manifest);
  return manifest;
}

/** Parse and validate a baseline JSON string. */
export function parseBaselineFile(contents: string): BaselineFile {
  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Baseline file must be a JSON object");
  }

  if (parsed["version"] !== 1) {
    throw new Error("Unsupported baseline version");
  }

  const tools = parsed["tools"];
  if (!Array.isArray(tools)) {
    throw new Error("Baseline file must contain a 'tools' array");
  }

  return parsed as unknown as BaselineFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
