import type { AnalyzePolicyImpactInput, AffectedPolicy } from "./types.js";

/** Analyze how tool drift impacts existing policy rules. */
export function analyzePolicyImpact(input: AnalyzePolicyImpactInput): AffectedPolicy[] {
  const { drifts, policyDocument } = input;
  const affected: AffectedPolicy[] = [];
  const processedDrifts = new Set<string>();

  for (const drift of drifts) {
    const { tool, type: driftType, severity: driftSeverity } = drift;
    const driftKey = `${tool}:${driftType}`;
    if (processedDrifts.has(driftKey)) {
      continue;
    }
    processedDrifts.add(driftKey);

    // Find rules that match this tool (either directly or via wildcard)
    const matchingRules = policyDocument.policies.filter(
      (rule) => rule.match.tool === tool || rule.match.tool === "*"
    );

    const hasDirectMatch = policyDocument.policies.some((rule) => rule.match.tool === tool);

    // 1. Analyze matching rules for allow decisions on drifted tools
    for (const rule of matchingRules) {
      if (rule.decision.toLowerCase() === "allow") {
        if (rule.match.tool === "*") {
          affected.push({
            policyId: rule.id,
            tool,
            reason: `Policy rule allows all tools via wildcard, which covers drifted tool '${tool}' (${driftType})`,
            severity: driftSeverity,
            suggestedAction:
              "Restrict wildcard policy to specific approved tools or update baseline."
          });
        } else {
          affected.push({
            policyId: rule.id,
            tool,
            reason: `Policy rule allows tool '${tool}' which has drifted (${driftType})`,
            severity: driftSeverity,
            suggestedAction:
              "Verify the tool changes and recreate baseline, or change decision to require_approval."
          });
        }
      }
    }

    // 2. Analyze new high-risk tools with no specific policy rules
    if (driftType === "new_tool" && driftSeverity === "high") {
      if (!hasDirectMatch) {
        // Check if allowed by wildcard
        const wildcardAllowRule = policyDocument.policies.find(
          (rule) => rule.match.tool === "*" && rule.decision.toLowerCase() === "allow"
        );

        if (wildcardAllowRule) {
          affected.push({
            policyId: wildcardAllowRule.id,
            tool,
            reason: `New high-risk tool '${tool}' has no specific policy rule and is allowed by wildcard rule '${wildcardAllowRule.id}'`,
            severity: "high",
            suggestedAction: "Add an explicit policy rule to govern this new tool."
          });
        } else if (policyDocument.defaults?.decision?.toLowerCase() === "allow") {
          affected.push({
            policyId: "default",
            tool,
            reason: `New high-risk tool '${tool}' has no specific policy rule and is allowed by default policy`,
            severity: "high",
            suggestedAction:
              "Add an explicit policy rule to block or require approval for this tool."
          });
        } else {
          affected.push({
            policyId: "none",
            tool,
            reason: `New high-risk tool '${tool}' has no matching policy rules`,
            severity: "medium",
            suggestedAction: "Define an explicit policy rule for this tool."
          });
        }
      }
    }
  }

  return affected;
}
