import type {
  ToolDefinition,
  BaselineTool,
  DriftFinding,
  DriftType,
  DriftSeverity,
  ToolManifest,
  BaselineFile,
  DriftCheckResult
} from "./types.js";
import { inferCapabilities } from "./capability-rules.js";
import { deterministicHash } from "./fingerprints.js";
import { sanitizeEndpoint, validateManifest } from "./normalize.js";

/** Map a drift type to its default severity. */
export function driftSeverity(type: DriftType): DriftSeverity {
  switch (type) {
    case "permissions_changed":
    case "capabilities_changed":
    case "endpoint_changed":
    case "tool_removed":
      return "high";
    case "schema_changed":
      return "medium";
    case "description_changed":
    case "tool_added":
      return "low";
  }
}

/** Capabilities that make a new tool high-risk. */
const highRiskCapabilities = new Set([
  "shell",
  "delete",
  "payment",
  "auth",
  "secret",
  "production",
  "external_side_effect",
  // Backwards compatibility aliases
  "code_execution",
  "secrets_access",
  "deployment"
]);

/** Get effective capabilities for a tool, preferring explicit declarations over heuristic fallbacks. */
export function getEffectiveCapabilities(tool: ToolDefinition | BaselineTool): string[] {
  if (tool.capabilities !== undefined) {
    // Preserves explicit capabilities (deduplicated and sorted)
    return [...new Set(tool.capabilities)].sort();
  }
  // Heuristic suggestions are fallback only
  const inferred =
    (tool as BaselineTool).inferredCapabilities ?? inferCapabilities(tool.name, tool.description);
  return [...new Set(inferred)].sort();
}

/** Determine severity for a newly added tool. Explicit capabilities are preferred; heuristics are fallback only. */
export function newToolSeverity(tool: ToolDefinition): DriftSeverity {
  const caps = getEffectiveCapabilities(tool);
  if (caps.some((cap) => highRiskCapabilities.has(cap))) {
    return "high";
  }
  return "low";
}

/** Compare a current tool definition against a baseline tool entry. */
export function compareTool(current: ToolDefinition, baseline: BaselineTool): DriftFinding[] {
  const findings: DriftFinding[] = [];

  // Schema drift
  const currentSchemaHash = deterministicHash(current.inputSchema);
  const baselineSchemaHash = deterministicHash(baseline.inputSchema);
  if (currentSchemaHash !== baselineSchemaHash) {
    findings.push({
      tool: current.name,
      type: "schema_changed",
      severity: "medium",
      detail: "input schema has changed since baseline"
    });
  }

  // Permissions drift (expanded vs reduced)
  const currentPerms = new Set(current.permissions ?? []);
  const baselinePerms = new Set(baseline.permissions ?? []);

  const addedPerms = [...currentPerms].filter((p) => !baselinePerms.has(p)).sort();
  const removedPerms = [...baselinePerms].filter((p) => !currentPerms.has(p)).sort();

  if (addedPerms.length > 0) {
    findings.push({
      tool: current.name,
      type: "permissions_changed",
      severity: "high",
      detail: `permissions expanded: added [${addedPerms.join(", ")}]`
    });
  }
  if (removedPerms.length > 0) {
    findings.push({
      tool: current.name,
      type: "permissions_changed",
      severity: "low",
      detail: `permissions reduced: removed [${removedPerms.join(", ")}]`
    });
  }

  // Capabilities drift (expanded vs reduced)
  const currentCaps = getEffectiveCapabilities(current);
  const baselineCaps = getEffectiveCapabilities(baseline);

  const addedCaps = currentCaps.filter((c) => !baselineCaps.includes(c)).sort();
  const removedCaps = baselineCaps.filter((c) => !currentCaps.includes(c)).sort();

  if (addedCaps.length > 0) {
    findings.push({
      tool: current.name,
      type: "capabilities_changed",
      severity: "high",
      detail: `capabilities expanded: added [${addedCaps.join(", ")}]`
    });
  }
  if (removedCaps.length > 0) {
    findings.push({
      tool: current.name,
      type: "capabilities_changed",
      severity: "low",
      detail: `capabilities reduced: removed [${removedCaps.join(", ")}]`
    });
  }

  // Endpoint drift
  const currentSanitizedEndpoint = sanitizeEndpoint(current.endpoint);
  const baselineSanitizedEndpoint = sanitizeEndpoint(baseline.endpoint);
  if ((currentSanitizedEndpoint ?? "") !== (baselineSanitizedEndpoint ?? "")) {
    findings.push({
      tool: current.name,
      type: "endpoint_changed",
      severity: "high",
      detail: `endpoint changed: baseline=${baselineSanitizedEndpoint ?? "(none)"} current=${currentSanitizedEndpoint ?? "(none)"}`
    });
  }

  // Description drift
  if ((current.description ?? "") !== (baseline.description ?? "")) {
    findings.push({
      tool: current.name,
      type: "description_changed",
      severity: "low",
      detail: "description has changed since baseline"
    });
  }

  return findings;
}

/** Run a full drift check comparing a manifest against a baseline. */
export function checkDrift(
  manifest: ToolManifest,
  baseline: BaselineFile,
  toolsFile: string,
  baselineFile: string
): DriftCheckResult {
  validateManifest(manifest);
  const findings: DriftFinding[] = [];
  const baselineMap = new Map(baseline.tools.map((t) => [t.name, t]));
  const currentMap = new Map(manifest.tools.map((t) => [t.name, t]));

  // Check each current tool against baseline
  for (const tool of manifest.tools) {
    const baselineTool = baselineMap.get(tool.name);
    if (baselineTool === undefined) {
      const severity = newToolSeverity(tool);
      findings.push({
        tool: tool.name,
        type: "tool_added",
        severity,
        detail:
          severity === "high"
            ? "tool is new and has high-risk capabilities"
            : "tool is new and was not in the baseline"
      });
    } else {
      findings.push(...compareTool(tool, baselineTool));
    }
  }

  // Check for removed tools
  for (const baselineTool of baseline.tools) {
    if (!currentMap.has(baselineTool.name)) {
      findings.push({
        tool: baselineTool.name,
        type: "tool_removed",
        severity: "high",
        detail: "tool was in the baseline but is no longer present"
      });
    }
  }

  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;

  return {
    baselineFile,
    toolsFile,
    checkedAt: new Date().toISOString(),
    totalTools: manifest.tools.length,
    baselineTools: baseline.tools.length,
    findings,
    summary: { high, medium, low, total: findings.length }
  };
}
