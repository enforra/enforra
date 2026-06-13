import type {
  ToolDefinition,
  DriftType,
  DriftSeverity,
  CapabilityRule,
  RiskProfile
} from "./types.js";
import {
  detectCapabilityMetadataMismatches,
  guessCapabilitiesFromToolMetadata
} from "./metadata-lint.js";

/** Map a drift type to its severity using the provided risk profile. */
export function driftSeverity(
  type: DriftType,
  riskProfile?: RiskProfile
): DriftSeverity | undefined {
  if (!riskProfile) {
    return undefined;
  }
  if (riskProfile.driftSeverities?.[type]) {
    return riskProfile.driftSeverities[type];
  }
  // Fallback defaults only if a risk profile is provided
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
    default:
      return "low";
  }
}

/** Determine severity for a newly added tool using the provided risk profile. */
export function newToolSeverity(
  tool: ToolDefinition,
  riskProfile?: RiskProfile,
  rules: CapabilityRule[] = []
): DriftSeverity | undefined {
  if (!riskProfile) {
    return undefined;
  }

  const highRiskCaps = new Set(riskProfile.highRiskCapabilities ?? []);
  const highRiskTags = new Set(riskProfile.highRiskRiskTags ?? []);
  const highRiskPerms = new Set(riskProfile.highRiskPermissions ?? []);

  // Check explicit risk tags
  if (tool.riskTags !== undefined) {
    for (const tag of tool.riskTags) {
      if (highRiskTags.has(tag)) {
        return "high";
      }
    }
  }

  // Check explicit permissions
  if (tool.permissions !== undefined) {
    for (const perm of tool.permissions) {
      if (highRiskPerms.has(perm)) {
        return "high";
      }
    }
  }

  if (tool.capabilities !== undefined) {
    // If capabilities are explicitly declared
    const declared = new Set(tool.capabilities);
    // 1. Check if any declared capability is high risk
    for (const cap of declared) {
      if (highRiskCaps.has(cap)) {
        return "high";
      }
    }
    // 2. Check if there are any metadata mismatches (e.g. name suggests high-risk cap but omitted)
    if (detectCapabilityMetadataMismatches(tool, riskProfile, rules).length > 0) {
      return "high";
    }
    return riskProfile.driftSeverities?.["new_tool"] ?? "low";
  }

  // If no capabilities are declared, fall back to heuristic guesses
  const guesses = guessCapabilitiesFromToolMetadata(tool.name, tool.description, rules);
  const hasHighRiskGuess = guesses.some((g) => highRiskCaps.has(g.capability));
  if (hasHighRiskGuess) {
    return "high";
  }

  return riskProfile.driftSeverities?.["new_tool"] ?? "low";
}
