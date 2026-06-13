import type {
  ToolDefinition,
  ToolManifest,
  BaselineTool,
  BaselineFile,
  CreateBaselineOptions
} from "./types.js";
import { deterministicHash } from "./fingerprint.js";
import {
  normalizeTool,
  sanitizeEndpoint,
  extractRequiredArgs,
  extractSensitiveArgs
} from "./normalize.js";

/** Create a baseline tool entry from a tool definition. */
export function createBaselineTool(tool: ToolDefinition): BaselineTool {
  const normalized = normalizeTool(tool);

  const fingerprint = deterministicHash({
    name: normalized.name,
    description: normalized.description,
    inputSchema: normalized.inputSchema,
    permissions: normalized.permissions,
    capabilities: normalized.capabilities,
    riskTags: normalized.riskTags,
    endpoint: normalized.endpoint,
    server: normalized.server,
    metadata: normalized.metadata
  });

  const serverEndpoint = normalized.server?.endpoint ?? normalized.endpoint;
  const sanitizedServerEndpoint = sanitizeEndpoint(serverEndpoint);

  const entry: BaselineTool = {
    name: normalized.name,
    fingerprint,
    schemaFingerprint: deterministicHash(normalized.inputSchema),
    descriptionFingerprint: deterministicHash(normalized.description),
    capabilities: [...(normalized.capabilities ?? [])].sort(),
    permissions: [...(normalized.permissions ?? [])].sort(),
    riskTags: [...(normalized.riskTags ?? [])].sort(),
    requiredArgs: extractRequiredArgs(normalized.inputSchema),
    sensitiveArgs: extractSensitiveArgs(normalized.inputSchema),
    metadataFingerprint: deterministicHash(normalized.metadata)
  };

  if (normalized.server !== undefined || sanitizedServerEndpoint !== undefined) {
    entry.server = {
      name: normalized.server?.name,
      endpointFingerprint: sanitizedServerEndpoint
        ? deterministicHash(sanitizedServerEndpoint)
        : undefined
    };
  }

  return entry;
}

/** Build a baseline file from a tool manifest. */
export function createToolBaseline(
  manifest: ToolManifest,
  options?: CreateBaselineOptions
): BaselineFile {
  const tools = manifest.tools.map(createBaselineTool).sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: 1,
    createdAt: options?.createdAt ?? new Date().toISOString(),
    source: manifest.source,
    environment: manifest.environment,
    toolCount: tools.length,
    tools
  };
}
