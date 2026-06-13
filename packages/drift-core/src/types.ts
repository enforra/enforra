// ---------------------------------------------------------------------------
// Tool manifest types
// ---------------------------------------------------------------------------

/** Server identity for a tool. */
export interface ToolServer {
  name?: string;
  endpoint?: string;
}

/** A single tool definition from a tool manifest file. */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  permissions?: string[];
  capabilities?: string[];
  riskTags?: string[];
  server?: ToolServer;
  endpoint?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/** The tool manifest file format. */
export interface ToolManifest {
  version?: number;
  source?: string;
  environment?: string;
  tools: ToolDefinition[];
}

// ---------------------------------------------------------------------------
// Baseline types
// ---------------------------------------------------------------------------

/** A single tool entry stored in the baseline. */
export interface BaselineTool {
  name: string;
  fingerprint: string;
  schemaFingerprint: string;
  descriptionFingerprint: string;
  capabilities: string[];
  permissions: string[];
  riskTags: string[];
  requiredArgs: string[];
  sensitiveArgs: string[];
  server?: {
    name?: string;
    endpointFingerprint?: string;
  };
  metadataFingerprint: string;
}

/** The baseline file format written to disk. */
export interface BaselineFile {
  version: 1;
  createdAt: string;
  source?: string;
  environment?: string;
  toolCount: number;
  tools: BaselineTool[];
}

/** Options for creating a baseline. */
export interface CreateBaselineOptions {
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Drift types
// ---------------------------------------------------------------------------

/** Types of drift that can be detected. */
export type DriftType =
  | "new_tool"
  | "removed_tool"
  | "schema_changed"
  | "description_changed"
  | "required_args_added"
  | "required_args_removed"
  | "sensitive_args_added"
  | "permissions_expanded"
  | "permissions_reduced"
  | "capabilities_expanded"
  | "capabilities_reduced"
  | "risk_tags_added"
  | "risk_tags_removed"
  | "endpoint_changed"
  | "metadata_changed"
  | "capability_metadata_mismatch";

/** Severity levels for drift findings. */
export type DriftSeverity = "high" | "medium" | "low";

/** User-defined risk profile configuration. */
export interface RiskProfile {
  highRiskCapabilities?: string[];
  highRiskRiskTags?: string[];
  highRiskPermissions?: string[];
  driftSeverities?: Record<string, DriftSeverity>;
}

/** A single drift finding for a tool. */
export interface DriftFinding {
  tool: string;
  type: DriftType;
  severity?: DriftSeverity;
  detail: string;
}

// ---------------------------------------------------------------------------
// Metadata lint types
// ---------------------------------------------------------------------------

export interface CapabilityRule {
  pattern: RegExp;
  capability: string;
}

/** A suggested capability from heuristic analysis. */
export interface SuggestedCapability {
  capability: string;
  source: "heuristic";
  confidence: "low";
}

/** A metadata warning from lint analysis. */
export interface MetadataWarning {
  tool: string;
  type: "capability_metadata_mismatch";
  severity?: DriftSeverity;
  detail: string;
}

// ---------------------------------------------------------------------------
// Policy impact types
// ---------------------------------------------------------------------------

/** A policy rule reference (subset of @enforra/policy-core PolicyRule). */
export interface PolicyRuleRef {
  id: string;
  match: {
    agent?: string;
    tool?: string;
  };
  decision: string;
}

/** A minimal policy document for drift impact analysis. */
export interface PolicyDocumentRef {
  version: number;
  defaults?: {
    decision?: string;
  };
  policies: PolicyRuleRef[];
}

/** An affected policy finding. */
export interface AffectedPolicy {
  policyId: string;
  tool: string;
  reason: string;
  severity?: DriftSeverity;
  suggestedAction: string;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Summary counts for a drift check. */
export interface DriftSummary {
  baselineTools: number;
  currentTools: number;
  driftFound: number;
  high?: number;
  medium?: number;
  low?: number;
}

/** The full result of a drift check. */
export interface DriftCheckResult {
  summary: DriftSummary;
  drifts: DriftFinding[];
  affectedPolicies: AffectedPolicy[];
  metadataWarnings: MetadataWarning[];
}

/** Input for checkToolDrift. */
export interface CheckToolDriftInput {
  baseline: BaselineFile;
  currentManifest: ToolManifest;
  policyDocument?: PolicyDocumentRef;
  rules?: CapabilityRule[];
  riskProfile?: RiskProfile;
}

/** Input for analyzePolicyImpact. */
export interface AnalyzePolicyImpactInput {
  drifts: DriftFinding[];
  policyDocument: PolicyDocumentRef;
}

// ---------------------------------------------------------------------------
// CLI-facing types (kept for compatibility)
// ---------------------------------------------------------------------------

export type DriftReportFormat = "text" | "json" | "markdown";

export type DriftFailLevel = "none" | "low" | "medium" | "high";
