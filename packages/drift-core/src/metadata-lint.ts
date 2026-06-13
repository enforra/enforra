import type {
  ToolDefinition,
  BaselineTool,
  SuggestedCapability,
  MetadataWarning,
  CapabilityRule,
  RiskProfile
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

/**
 * Detect capability metadata mismatches: when a tool has explicit capabilities but
 * its name/description suggests high-risk capabilities that are missing from the
 * declared list. Returns HIGH findings if risk profile matches.
 */
export function detectCapabilityMetadataMismatches(
  tool: ToolDefinition | BaselineTool,
  riskProfile?: RiskProfile,
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
    if (!declared.has(guess.capability)) {
      const isHighRisk = riskProfile?.highRiskCapabilities
        ? riskProfile.highRiskCapabilities.includes(guess.capability)
        : true;

      if (isHighRisk) {
        const severity =
          riskProfile?.driftSeverities?.["capability_metadata_mismatch"] ??
          (riskProfile ? "high" : undefined);
        warnings.push({
          tool: tool.name,
          type: "capability_metadata_mismatch",
          severity,
          detail: `tool name/description suggests '${guess.capability}' but declared capabilities omit it: [${[...declared].sort().join(", ")}]`
        });
      }
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
  riskProfile?: RiskProfile;
}): MetadataWarning[] {
  const { manifest, rules = [], riskProfile } = input;
  const warnings: MetadataWarning[] = [];
  for (const tool of manifest.tools) {
    warnings.push(...detectCapabilityMetadataMismatches(tool, riskProfile, rules));
  }
  return warnings;
}
