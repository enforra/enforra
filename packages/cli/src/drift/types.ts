/** A single tool definition from a tool manifest file. */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  permissions?: string[];
  capabilities?: string[];
  endpoint?: string;
  [key: string]: unknown;
}

/** The tool manifest file format: a JSON file with a tools array. */
export interface ToolManifest {
  tools: ToolDefinition[];
}

/** A single tool entry stored in the baseline. */
export interface BaselineTool {
  name: string;
  hash: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  permissions?: string[];
  capabilities?: string[];
  inferredCapabilities?: string[];
  endpoint?: string;
}

/** The baseline file format written to disk. */
export interface BaselineFile {
  version: 1;
  createdAt: string;
  toolCount: number;
  tools: BaselineTool[];
}

/** Types of drift that can be detected. */
export type DriftType =
  | "schema_changed"
  | "permissions_changed"
  | "capabilities_changed"
  | "endpoint_changed"
  | "description_changed"
  | "tool_added"
  | "tool_removed";

/** Severity levels for drift findings. */
export type DriftSeverity = "high" | "medium" | "low";

/** A single drift finding for a tool. */
export interface DriftFinding {
  tool: string;
  type: DriftType;
  severity: DriftSeverity;
  detail: string;
}

/** The result of a drift check. */
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
}

export type DriftReportFormat = "text" | "json" | "markdown";

export type DriftFailLevel = "none" | "low" | "medium" | "high";

export interface DriftCliIo {
  stdout?: Pick<typeof console, "log">;
  stderr?: Pick<typeof console, "error">;
  cwd?: string;
}

export interface DriftParsedOptions {
  values: Map<string, string>;
}

export interface DriftOptionSpec {
  commandName: string;
  values?: string[];
}

export interface SuggestedCapability {
  capability: string;
  source: "heuristic";
  confidence: "low";
}
