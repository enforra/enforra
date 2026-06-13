import type {
  ToolDefinition,
  BaselineTool,
  SuggestedCapability,
  MetadataWarning,
  CapabilityRule
} from "./types.js";

/**
 * Heuristically guess capabilities from tool metadata (name and description) using regex keyword patterns.
 * IMPORTANT: This is a best-effort heuristic fallback hint only. It is NOT authoritative security logic.
 */
export function guessCapabilitiesFromToolMetadata(
  name: string,
  description?: string,
  rules: CapabilityRule[] = []
): SuggestedCapability[] {
  const text = `${name} ${description ?? ""}`;
  const suggestions: SuggestedCapability[] = [];

  for (const { pattern, capability } of rules) {
    if (pattern.test(text)) {
      suggestions.push({
        capability,
        source: "heuristic",
        confidence: "low"
      });
    }
  }

  return suggestions;
}

/** Capabilities that make a new tool high-risk. */
export const HIGH_RISK_CAPABILITIES = new Set([
  "shell",
  "delete",
  "payment",
  "auth",
  "secret",
  "production",
  "network",
  "external_side_effect",
  // Backwards compatibility aliases
  "code_execution",
  "secrets_access",
  "deployment"
]);

/**
 * Detect capability metadata mismatches: when a tool has explicit capabilities but
 * its name/description suggests high-risk capabilities that are missing from the
 * declared list. Returns HIGH findings for shell/delete/payment/auth/secret/production/network.
 */
export function detectCapabilityMetadataMismatches(
  tool: ToolDefinition | BaselineTool,
  rules: CapabilityRule[] = []
): MetadataWarning[] {
  // Only applies when the tool explicitly declares capabilities
  if (tool.capabilities === undefined || tool.capabilities.length === 0) {
    return [];
  }
  const declared = new Set(tool.capabilities);
  const guesses = guessCapabilitiesFromToolMetadata(
    tool.name,
    (tool as ToolDefinition).description,
    rules
  );
  const warnings: MetadataWarning[] = [];

  for (const guess of guesses) {
    if (HIGH_RISK_CAPABILITIES.has(guess.capability) && !declared.has(guess.capability)) {
      warnings.push({
        tool: tool.name,
        type: "capability_metadata_mismatch",
        severity: "high",
        detail: `tool name/description suggests '${guess.capability}' but declared capabilities omit it: [${[...declared].sort().join(", ")}]`
      });
    }
  }

  return warnings;
}

/**
 * Public entry point for linting tool metadata.
 */
export function lintToolMetadata(input: {
  manifest: { tools: ToolDefinition[] };
  rules?: CapabilityRule[];
}): MetadataWarning[] {
  const { manifest, rules = [] } = input;
  const warnings: MetadataWarning[] = [];
  for (const tool of manifest.tools) {
    warnings.push(...detectCapabilityMetadataMismatches(tool, rules));
  }
  return warnings;
}
