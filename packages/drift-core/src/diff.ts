import type {
  ToolDefinition,
  BaselineTool,
  DriftFinding,
  DriftCheckResult,
  CheckToolDriftInput,
  MetadataWarning
} from "./types.js";
import { deterministicHash } from "./fingerprint.js";
import { sanitizeEndpoint, extractRequiredArgs, extractSensitiveArgs } from "./normalize.js";
import { detectCapabilityMetadataMismatches } from "./metadata-lint.js";
import { newToolSeverity } from "./severity.js";
import { analyzePolicyImpact } from "./policy-impact.js";

/** Compare a current tool definition against a baseline tool entry. */
export function compareTool(current: ToolDefinition, baseline: BaselineTool): DriftFinding[] {
  const findings: DriftFinding[] = [];

  // 1. Schema drift
  const currentSchemaHash = deterministicHash(current.inputSchema);
  if (currentSchemaHash !== baseline.schemaFingerprint) {
    findings.push({
      tool: current.name,
      type: "schema_changed",
      severity: "medium",
      detail: "input schema has changed since baseline"
    });
  }

  // 2. Description drift
  const currentDescHash = deterministicHash(current.description);
  if (currentDescHash !== baseline.descriptionFingerprint) {
    findings.push({
      tool: current.name,
      type: "description_changed",
      severity: "low",
      detail: "description has changed since baseline"
    });
  }

  // 3. Required args drift (added/removed)
  const currentReq = extractRequiredArgs(current.inputSchema);
  const baselineReq = baseline.requiredArgs ?? [];
  const addedReq = currentReq.filter((r) => !baselineReq.includes(r)).sort();
  const removedReq = baselineReq.filter((r) => !currentReq.includes(r)).sort();
  if (addedReq.length > 0) {
    findings.push({
      tool: current.name,
      type: "required_args_added",
      severity: "medium",
      detail: `required arguments added: [${addedReq.join(", ")}]`
    });
  }
  if (removedReq.length > 0) {
    findings.push({
      tool: current.name,
      type: "required_args_removed",
      severity: "low",
      detail: `required arguments removed: [${removedReq.join(", ")}]`
    });
  }

  // 4. Sensitive args drift (added)
  const currentSens = extractSensitiveArgs(current.inputSchema);
  const baselineSens = baseline.sensitiveArgs ?? [];
  const addedSens = currentSens.filter((s) => !baselineSens.includes(s)).sort();
  if (addedSens.length > 0) {
    findings.push({
      tool: current.name,
      type: "sensitive_args_added",
      severity: "medium",
      detail: `sensitive arguments added: [${addedSens.join(", ")}]`
    });
  }

  // 5. Permissions drift (expanded/reduced)
  const currentPerms = [...(current.permissions ?? [])].sort();
  const baselinePerms = [...(baseline.permissions ?? [])].sort();
  const addedPerms = currentPerms.filter((p) => !baselinePerms.includes(p)).sort();
  const removedPerms = baselinePerms.filter((p) => !currentPerms.includes(p)).sort();
  if (addedPerms.length > 0) {
    findings.push({
      tool: current.name,
      type: "permissions_expanded",
      severity: "high",
      detail: `permissions expanded: added [${addedPerms.join(", ")}]`
    });
  }
  if (removedPerms.length > 0) {
    findings.push({
      tool: current.name,
      type: "permissions_reduced",
      severity: "low",
      detail: `permissions reduced: removed [${removedPerms.join(", ")}]`
    });
  }

  // 6. Capabilities drift (expanded/reduced)
  const currentCaps = [...(current.capabilities ?? [])].sort();
  const baselineCaps = [...(baseline.capabilities ?? [])].sort();
  const addedCaps = currentCaps.filter((c) => !baselineCaps.includes(c)).sort();
  const removedCaps = baselineCaps.filter((c) => !currentCaps.includes(c)).sort();
  if (addedCaps.length > 0) {
    findings.push({
      tool: current.name,
      type: "capabilities_expanded",
      severity: "high",
      detail: `capabilities expanded: added [${addedCaps.join(", ")}]`
    });
  }
  if (removedCaps.length > 0) {
    findings.push({
      tool: current.name,
      type: "capabilities_reduced",
      severity: "low",
      detail: `capabilities reduced: removed [${removedCaps.join(", ")}]`
    });
  }

  // 7. Risk tags drift (added/removed)
  const currentTags = [...(current.riskTags ?? [])].sort();
  const baselineTags = [...(baseline.riskTags ?? [])].sort();
  const addedTags = currentTags.filter((t) => !baselineTags.includes(t)).sort();
  const removedTags = baselineTags.filter((t) => !currentTags.includes(t)).sort();
  if (addedTags.length > 0) {
    findings.push({
      tool: current.name,
      type: "risk_tags_added",
      severity: "medium",
      detail: `risk tags added: [${addedTags.join(", ")}]`
    });
  }
  if (removedTags.length > 0) {
    findings.push({
      tool: current.name,
      type: "risk_tags_removed",
      severity: "low",
      detail: `risk tags removed: [${removedTags.join(", ")}]`
    });
  }

  // 8. Endpoint drift
  const currentEndpoint = sanitizeEndpoint(current.server?.endpoint ?? current.endpoint);
  const currentEndpointHash = currentEndpoint ? deterministicHash(currentEndpoint) : undefined;
  const baselineEndpointHash = baseline.server?.endpointFingerprint;
  if ((currentEndpointHash ?? "") !== (baselineEndpointHash ?? "")) {
    findings.push({
      tool: current.name,
      type: "endpoint_changed",
      severity: "high",
      detail: `endpoint changed: baseline=${baselineEndpointHash ? "changed" : "(none)"} current=${currentEndpoint ? currentEndpoint : "(none)"}`
    });
  }

  // 9. Metadata drift
  const currentMetadataHash = deterministicHash(current.metadata);
  if ((currentMetadataHash ?? "") !== (baseline.metadataFingerprint ?? "")) {
    findings.push({
      tool: current.name,
      type: "metadata_changed",
      severity: "low",
      detail: "metadata has changed since baseline"
    });
  }

  // 10. Capability metadata mismatch
  const mismatches = detectCapabilityMetadataMismatches(current);
  for (const mm of mismatches) {
    findings.push({
      tool: current.name,
      type: "capability_metadata_mismatch",
      severity: mm.severity,
      detail: mm.detail
    });
  }

  return findings;
}

/** Check tool definition drift from baseline. */
export function checkToolDrift(input: CheckToolDriftInput): DriftCheckResult {
  const { baseline, currentManifest, policyDocument, lintMetadata = true } = input;
  const drifts: DriftFinding[] = [];
  const metadataWarnings: MetadataWarning[] = [];

  const baselineMap = new Map(baseline.tools.map((t) => [t.name, t]));
  const currentMap = new Map(currentManifest.tools.map((t) => [t.name, t]));

  // Check each current tool
  for (const tool of currentManifest.tools) {
    const baselineTool = baselineMap.get(tool.name);
    if (baselineTool === undefined) {
      const severity = newToolSeverity(tool);
      drifts.push({
        tool: tool.name,
        type: "new_tool",
        severity,
        detail:
          severity === "high"
            ? "tool is new and has high-risk capabilities"
            : "tool is new and was not in the baseline"
      });

      // Check metadata mismatches on new tools
      if (lintMetadata) {
        const mismatches = detectCapabilityMetadataMismatches(tool);
        for (const mm of mismatches) {
          drifts.push({
            tool: tool.name,
            type: "capability_metadata_mismatch",
            severity: mm.severity,
            detail: mm.detail
          });
          metadataWarnings.push(mm);
        }
      }
    } else {
      const toolDrifts = compareTool(tool, baselineTool);
      drifts.push(...toolDrifts);

      if (lintMetadata) {
        const mismatches = detectCapabilityMetadataMismatches(tool);
        metadataWarnings.push(...mismatches);
      }
    }
  }

  // Check for removed tools
  for (const baselineTool of baseline.tools) {
    if (!currentMap.has(baselineTool.name)) {
      drifts.push({
        tool: baselineTool.name,
        type: "removed_tool",
        severity: "high",
        detail: "tool was in the baseline but is no longer present"
      });
    }
  }

  // 11. Policy impact analysis
  const affectedPolicies = policyDocument ? analyzePolicyImpact({ drifts, policyDocument }) : [];

  // Calculate summary
  const high = drifts.filter((d) => d.severity === "high").length;
  const medium = drifts.filter((d) => d.severity === "medium").length;
  const low = drifts.filter((d) => d.severity === "low").length;

  return {
    summary: {
      baselineTools: baseline.tools.length,
      currentTools: currentManifest.tools.length,
      driftFound: drifts.length,
      high,
      medium,
      low
    },
    drifts,
    affectedPolicies,
    metadataWarnings
  };
}
