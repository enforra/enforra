/**
 * TEMPORARY COMPATIBILITY SHIMS
 *
 * These shims are kept for backward compatibility with existing tests and integrations
 * that expect legacy format tool baselines, drift types, or return values.
 * They will be removed once consumers migrate directly to @enforra/drift-core.
 */

import {
  driftSeverity as coreDriftSeverity,
  newToolSeverity as coreNewToolSeverity,
  compareTool as coreCompareTool,
  checkToolDrift as coreCheckToolDrift,
  detectCapabilityMetadataMismatches as coreDetectMismatches,
  guessCapabilitiesFromToolMetadata as coreGuess,
  deterministicHash as coreHash,
  createBaselineTool as coreCreateBaselineTool,
  normalizeToolManifest as coreNormalizeManifest,
  parseToolManifest as coreParseManifest,
  parseBaselineFile as coreParseBaseline,
  sanitizeEndpoint as coreSanitizeEndpoint
} from "@enforra/drift-core";
import type {
  ToolDefinition,
  BaselineTool,
  ToolManifest,
  BaselineFile,
  DriftType as CoreDriftType,
  AffectedPolicy,
  MetadataWarning
} from "@enforra/drift-core";

export type DriftSeverity = "high" | "medium" | "low";

export type DriftType =
  | "schema_changed"
  | "permissions_changed"
  | "capabilities_changed"
  | "capability_metadata_mismatch"
  | "endpoint_changed"
  | "description_changed"
  | "tool_added"
  | "tool_removed";

export interface DriftFinding {
  tool: string;
  type: DriftType;
  severity: DriftSeverity;
  detail: string;
}

export interface DriftCheckResult {
  baselineFile: string;
  toolsFile: string;
  checkedAt: string;
  totalTools: number;
  baselineTools: number;
  findings: DriftFinding[];
  summary: {
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  affectedPolicies?: AffectedPolicy[];
  metadataWarnings?: MetadataWarning[];
}

export const deterministicHash = coreHash;
export const guessCapabilitiesFromToolMetadata = coreGuess;
export const sanitizeEndpoint = coreSanitizeEndpoint;
export const normalizeManifest = coreNormalizeManifest;
export const parseToolManifest = coreParseManifest;
export const parseBaselineFile = coreParseBaseline;

export function validateManifest(manifest: unknown): void {
  coreNormalizeManifest(manifest as ToolManifest);
}

export function inferCapabilities(name: string, description?: string): string[] {
  const guesses = coreGuess(name, description);
  return [...new Set(guesses.map((g) => g.capability))].sort();
}

export function driftSeverity(type: string): DriftSeverity {
  if (type === "permissions_expanded" || type === "permissions_reduced") {
    return type === "permissions_expanded" ? "high" : "low";
  }
  if (type === "capabilities_expanded" || type === "capabilities_reduced") {
    return type === "capabilities_expanded" ? "high" : "low";
  }
  if (type === "new_tool") return "low";
  if (type === "removed_tool") return "high";
  if (type === "permissions_changed") return "high";
  if (type === "capabilities_changed") return "high";
  if (type === "tool_removed") return "high";
  if (type === "tool_added") return "low";
  return coreDriftSeverity(type as CoreDriftType) as DriftSeverity;
}

export const newToolSeverity = coreNewToolSeverity;

export function getEffectiveCapabilities(tool: {
  name: string;
  description?: string;
  capabilities?: string[];
}): string[] {
  if (tool.capabilities !== undefined) {
    return [...new Set(tool.capabilities)].sort();
  }
  const guesses = coreGuess(tool.name, tool.description);
  return [...new Set(guesses.map((g) => g.capability))].sort();
}

export function detectCapabilityMetadataMismatches(tool: {
  name: string;
  description?: string;
  capabilities?: string[];
}): DriftFinding[] {
  const warnings = coreDetectMismatches(tool as ToolDefinition);
  return warnings.map((w) => ({
    tool: w.tool,
    type: "capability_metadata_mismatch" as DriftType,
    severity: w.severity,
    detail: w.detail
  }));
}

function normalizeBaselineToolForCore(t: Record<string, unknown>): Record<string, unknown> {
  if (!t) return t;
  const nt = { ...t };
  if (t.hash && !t.fingerprint) {
    nt.fingerprint = t.hash as string;
  }
  if (t.inputSchema !== undefined && !t.schemaFingerprint) {
    nt.schemaFingerprint = coreHash(t.inputSchema);
  } else if (!nt.schemaFingerprint) {
    nt.schemaFingerprint = "";
  }

  if (t.description !== undefined && !t.descriptionFingerprint) {
    nt.descriptionFingerprint = coreHash(t.description);
  } else if (!nt.descriptionFingerprint) {
    nt.descriptionFingerprint = "";
  }

  if (t.metadata !== undefined && !t.metadataFingerprint) {
    nt.metadataFingerprint = coreHash(t.metadata);
  } else if (!nt.metadataFingerprint) {
    nt.metadataFingerprint = "";
  }

  if (t.server && typeof t.server === "object") {
    const s = t.server as Record<string, unknown>;
    if (s.endpoint !== undefined && !s.endpointFingerprint) {
      nt.server = {
        ...s,
        endpointFingerprint: coreHash(s.endpoint)
      };
    }
  } else if (t.endpoint !== undefined) {
    nt.server = {
      ...(t.server as Record<string, unknown> | undefined),
      endpointFingerprint: coreHash(t.endpoint)
    };
  }

  return nt;
}

function normalizeBaselineForCore(baseline: Record<string, unknown>): Record<string, unknown> {
  if (!baseline) return baseline;
  const tools = ((baseline.tools as Record<string, unknown>[]) ?? []).map(
    normalizeBaselineToolForCore
  );
  return {
    ...baseline,
    tools
  };
}

export function createBaselineTool(tool: ToolDefinition): Record<string, unknown> {
  const coreEntry = coreCreateBaselineTool(tool);
  const entry: Record<string, unknown> = {
    name: coreEntry.name,
    hash: coreEntry.fingerprint
  };

  if (tool.description !== undefined) {
    entry.description = tool.description;
  }
  if (tool.inputSchema !== undefined) {
    entry.inputSchema = tool.inputSchema;
  }
  if (tool.permissions !== undefined) {
    entry.permissions = coreEntry.permissions;
  }
  if (tool.capabilities !== undefined) {
    entry.capabilities = coreEntry.capabilities;
  }

  // inferredCapabilities fallback
  if (tool.capabilities === undefined) {
    entry.inferredCapabilities = getEffectiveCapabilities(tool);
  }

  // endpoint compatibility
  const endpoint = tool.server?.endpoint ?? tool.endpoint;
  if (endpoint !== undefined) {
    entry.endpoint = coreSanitizeEndpoint(endpoint);
  }

  return entry;
}

export function buildBaseline(
  manifest: ToolManifest,
  options?: { createdAt?: string }
): Record<string, unknown> {
  const tools = manifest.tools
    .map(createBaselineTool)
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
      (a.name as string).localeCompare(b.name as string)
    );

  return {
    version: 1,
    createdAt: options?.createdAt ?? new Date().toISOString(),
    toolCount: tools.length,
    tools
  };
}

export function compareTool(current: ToolDefinition, baseline: BaselineTool): DriftFinding[] {
  const normalizedBaseline = normalizeBaselineToolForCore(
    baseline as unknown as Record<string, unknown>
  );
  const coreFindings = coreCompareTool(current, normalizedBaseline as unknown as BaselineTool);
  return coreFindings.map((f) => ({
    tool: f.tool,
    type: mapDriftTypeToOld(f.type) as DriftType,
    severity: f.severity,
    detail: f.detail
  }));
}

function mapDriftTypeToOld(type: string): string {
  if (type === "new_tool") return "tool_added";
  if (type === "removed_tool") return "tool_removed";
  if (type === "permissions_expanded" || type === "permissions_reduced")
    return "permissions_changed";
  if (type === "capabilities_expanded" || type === "capabilities_reduced")
    return "capabilities_changed";
  return type;
}

export function checkDrift(
  manifest: ToolManifest,
  baseline: BaselineFile,
  toolsFile: string,
  baselineFile: string
): DriftCheckResult {
  const normalizedBaseline = normalizeBaselineForCore(
    baseline as unknown as Record<string, unknown>
  );
  const coreResult = coreCheckToolDrift({
    baseline: normalizedBaseline as unknown as BaselineFile,
    currentManifest: manifest,
    lintMetadata: true
  });

  const findings = coreResult.drifts.map((f) => ({
    tool: f.tool,
    type: mapDriftTypeToOld(f.type) as DriftType,
    severity: f.severity,
    detail: f.detail
  }));

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
