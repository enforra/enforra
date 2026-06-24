import type { ToolManifest, BaselineFile } from "./types.js";
import { isRecord } from "./normalize.js";

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

  // Validate no duplicate tool names
  const seen = new Set<string>();
  for (const tool of tools) {
    const name = (tool as Record<string, unknown>)["name"] as string;
    if (seen.has(name)) {
      throw new Error(`Duplicate tool name found in manifest: ${name}`);
    }
    seen.add(name);
  }

  return parsed as unknown as ToolManifest;
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

  for (const tool of tools) {
    if (
      !isRecord(tool) ||
      typeof tool["name"] !== "string" ||
      tool["name"].length === 0 ||
      typeof tool["fingerprint"] !== "string" ||
      tool["fingerprint"].length === 0
    ) {
      throw new Error("Each baseline tool must have a non-empty 'name' and 'fingerprint' string");
    }
  }

  // Validate no duplicate baseline tool names
  const seen = new Set<string>();
  for (const tool of tools) {
    const name = (tool as Record<string, unknown>)["name"] as string;
    if (seen.has(name)) {
      throw new Error(`Duplicate tool name found in baseline: ${name}`);
    }
    seen.add(name);
  }

  return parsed as unknown as BaselineFile;
}

/**
 * Normalize a tool manifest: validate and return a clean copy.
 * This is the public API entry for manifest normalization.
 */
export function normalizeToolManifest(manifest: ToolManifest): ToolManifest {
  // Re-parse through validation to ensure consistency
  const json = JSON.stringify(manifest);
  return parseToolManifest(json);
}
