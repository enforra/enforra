import type { ToolDefinition, DriftType, DriftSeverity, CapabilityRule } from "./types.js";
import {
  HIGH_RISK_CAPABILITIES,
  detectCapabilityMetadataMismatches,
  guessCapabilitiesFromToolMetadata
} from "./metadata-lint.js";

/** Map a drift type to its default severity. */
export function driftSeverity(type: DriftType): DriftSeverity {
  switch (type) {
    case "permissions_expanded":
    case "capabilities_expanded":
    case "capability_metadata_mismatch":
    case "endpoint_changed":
    case "removed_tool":
      return "high";
    case "schema_changed":
    case "required_args_added":
    case "sensitive_args_added":
    case "risk_tags_added":
      return "medium";
    case "description_changed":
    case "permissions_reduced":
    case "capabilities_reduced":
    case "required_args_removed":
    case "risk_tags_removed":
    case "metadata_changed":
    case "new_tool":
      return "low";
  }
}

/** Determine severity for a newly added tool. */
export function newToolSeverity(tool: ToolDefinition, rules: CapabilityRule[] = []): DriftSeverity {
  if (tool.capabilities !== undefined) {
    // If capabilities are explicitly declared
    const declared = new Set(tool.capabilities);
    // 1. Check if any declared capability is high risk
    for (const cap of declared) {
      if (HIGH_RISK_CAPABILITIES.has(cap)) {
        return "high";
      }
    }
    // 2. Check if there are any metadata mismatches (e.g. name suggests high-risk cap but omitted)
    if (detectCapabilityMetadataMismatches(tool, rules).length > 0) {
      return "high";
    }
    return "low";
  }

  // If no capabilities are declared, fall back to heuristic guesses
  const guesses = guessCapabilitiesFromToolMetadata(tool.name, tool.description, rules);
  const hasHighRiskGuess = guesses.some((g) => HIGH_RISK_CAPABILITIES.has(g.capability));
  if (hasHighRiskGuess) {
    return "high";
  }

  return "low";
}
