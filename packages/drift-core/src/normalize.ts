import type { ToolDefinition } from "./types.js";

/**
 * Sanitize an endpoint string by stripping query parameters, hash fragments,
 * and userinfo (username:password) from URLs. This ensures secrets are not
 * stored in baselines.
 */
export function sanitizeEndpoint(endpoint: string | undefined): string | undefined {
  if (endpoint === undefined) {
    return undefined;
  }
  try {
    const url = new URL(endpoint);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    // Non-URL endpoints (e.g. "local://filesystem"): strip query/hash naively
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
  if (tool.riskTags !== undefined) {
    normalized.riskTags = [...tool.riskTags].sort();
  }
  if (tool.endpoint !== undefined) {
    normalized.endpoint = sanitizeEndpoint(tool.endpoint);
  }
  if (tool.server !== undefined) {
    normalized.server = {
      name: tool.server.name,
      endpoint: sanitizeEndpoint(tool.server.endpoint)
    };
  }
  if (tool.metadata !== undefined) {
    normalized.metadata = tool.metadata;
  }
  return normalized;
}

/**
 * Extract required argument names from an input schema.
 * Reads the "required" field if the schema is a JSON Schema object.
 */
export function extractRequiredArgs(schema: Record<string, unknown> | undefined): string[] {
  if (schema === undefined) {
    return [];
  }
  const required = schema["required"];
  if (!Array.isArray(required)) {
    return [];
  }
  return required.filter((v): v is string => typeof v === "string").sort();
}

/**
 * Extract argument names that look sensitive from an input schema.
 * Checks property names against common sensitive patterns.
 */
const sensitivePatterns = [
  "token",
  "secret",
  "api_key",
  "apikey",
  "password",
  "credential",
  "private_key",
  "privatekey",
  "auth",
  "authorization",
  "bearer",
  "sudo"
];

export function extractSensitiveArgs(schema: Record<string, unknown> | undefined): string[] {
  if (schema === undefined) {
    return [];
  }
  const properties = schema["properties"];
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return [];
  }
  const propNames = Object.keys(properties as Record<string, unknown>);
  return propNames
    .filter((name) => {
      const lower = name.toLowerCase();
      return sensitivePatterns.some((pattern) => lower.includes(pattern));
    })
    .sort();
}

/** Check if a value is a plain record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
