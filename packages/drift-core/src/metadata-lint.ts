import type {
  ToolDefinition,
  BaselineTool,
  SuggestedCapability,
  MetadataWarning
} from "./types.js";

export interface CapabilityRule {
  pattern: RegExp;
  capability: string;
}

export const DEFAULT_METADATA_LINT_RULES: CapabilityRule[] = [
  // shell (high risk code execution)
  {
    pattern: /(?:^|[^a-zA-Z])(terminal|shell|bash|exec|command|spawn)(?:$|[^a-zA-Z])/i,
    capability: "shell"
  },
  // delete (high risk data modification)
  {
    pattern: /(?:^|[^a-zA-Z])(delete|remove|destroy|wipe|drop|clear|purge)(?:$|[^a-zA-Z])/i,
    capability: "delete"
  },
  // write
  {
    pattern: /(?:^|[^a-zA-Z])(write|create|post|put|update|modify|save)(?:$|[^a-zA-Z])/i,
    capability: "write"
  },
  // read
  {
    pattern: /(?:^|[^a-zA-Z])(read|view|list)(?:$|[^a-zA-Z])/i,
    capability: "read"
  },
  // network
  {
    pattern: /(?:^|[^a-zA-Z])(network|http|request|url|curl|wget)(?:$|[^a-zA-Z])/i,
    capability: "network"
  },
  // database (e.g. database schema/tables)
  {
    pattern: /(?:^|[^a-zA-Z])(db|database|sql|table|collection)(?:$|[^a-zA-Z])/i,
    capability: "database"
  },
  // payment
  {
    pattern:
      /(?:^|[^a-zA-Z])(pay|payment|charge|refund|stripe|billing|checkout|invoice)(?:$|[^a-zA-Z])/i,
    capability: "payment"
  },
  // auth
  { pattern: /(?:^|[^a-zA-Z])(auth|login|jwt)(?:$|[^a-zA-Z])/i, capability: "auth" },
  // secret (credentials)
  {
    pattern: /(?:^|[^a-zA-Z])(secret|key|token|password|credential)(?:$|[^a-zA-Z])/i,
    capability: "secret"
  },
  // production
  {
    pattern: /(?:^|[^a-zA-Z])(prod|production|live|release|deploy|publish)(?:$|[^a-zA-Z])/i,
    capability: "production"
  },
  // external_side_effect
  {
    pattern: /(?:^|[^a-zA-Z])(email|mail|notify|notification|slack|webhook|sms)(?:$|[^a-zA-Z])/i,
    capability: "external_side_effect"
  }
];

// Alias for backwards compatibility
export const CAPABILITY_RULES = DEFAULT_METADATA_LINT_RULES;

/**
 * Heuristically guess capabilities from tool metadata (name and description) using regex keyword patterns.
 * IMPORTANT: This is a best-effort heuristic fallback hint only. It is NOT authoritative security logic.
 */
export function guessCapabilitiesFromToolMetadata(
  name: string,
  description?: string,
  rules: CapabilityRule[] = DEFAULT_METADATA_LINT_RULES
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
  rules: CapabilityRule[] = DEFAULT_METADATA_LINT_RULES
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
  const { manifest, rules = DEFAULT_METADATA_LINT_RULES } = input;
  const warnings: MetadataWarning[] = [];
  for (const tool of manifest.tools) {
    warnings.push(...detectCapabilityMetadataMismatches(tool, rules));
  }
  return warnings;
}
