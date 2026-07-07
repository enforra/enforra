export type CommandRisk = "low" | "medium" | "high";

export type CommandSignal =
  | "code_execution"
  | "shell_execution"
  | "package_execution"
  | "package_install"
  | "package_mutation"
  | "network_download"
  | "download_and_execute"
  | "file_read"
  | "file_write"
  | "file_delete"
  | "sensitive_path_access"
  | "secret_read"
  | "environment_read"
  | "external_transfer"
  | "source_control_read"
  | "source_control_write"
  | "infra_tool"
  | "deployment"
  | "write_operation"
  | "delete_operation"
  | "privilege_change"
  | "unknown_command";

export type CommandClassification = {
  executable: string;
  subcommand: string;
  command: string;
  argv: string[];

  tool: string;
  category: string;
  suggestedRisk: CommandRisk;
  risk: CommandRisk; // for backward compatibility

  signals: CommandSignal[];
  matchedDetectors: string[];

  // Derived / deprecated fields for backward compatibility
  /** @deprecated Use signals.includes("delete_operation") and check risk instead */
  destructiveOperation: boolean;
  /** @deprecated Use signals.includes("sensitive_path_access") instead */
  touchesSensitivePath: boolean;
  /** @deprecated Use signals.includes("secret_read") or signals.includes("environment_read") instead */
  readsSecrets: boolean;
  /** @deprecated Available for backward compatibility */
  writesSecrets: boolean;
  /** @deprecated Use signals.includes("package_install") instead */
  packageInstall: boolean;
  /** @deprecated Use signals.includes("package_mutation") instead */
  packageMutation: boolean;
  /** @deprecated Use signals.includes("network_download") instead */
  networkDownload: boolean;
  /** @deprecated Use signals.includes("download_and_execute") instead */
  downloadAndExecute: boolean;
  /** @deprecated Use signals.includes("external_transfer") instead */
  dataExfiltration: boolean;
  /** @deprecated Use signals.includes("infra_tool") instead */
  cloudOrInfraAccess: boolean;
  /** @deprecated Use signals.includes("infra_tool") and credentials checks instead */
  cloudCredentialAccess: boolean;
  /** @deprecated Use signals.includes("privilege_change") instead */
  privilegeEscalation: boolean;
  /** @deprecated Available for backward compatibility */
  workspaceWrite: boolean;
  /** @deprecated Use signals.includes("unknown_command") instead */
  unknownCommand: boolean;
};

export type CommandDetectorResult = {
  tool?: string;
  category?: string;
  signals?: CommandSignal[];
  suggestedRisk?: CommandRisk;
  matchedDetectors?: string[];
};

export type CommandDetectorInput = {
  executable: string;
  subcommand: string;
  command: string;
  argv: string[];
  options: NormalizedCommandGuardOptions;
};

export type CommandDetector = (input: CommandDetectorInput) => CommandDetectorResult | null;

export type CommandGuardOptions = {
  extraSensitivePaths?: string[];
  extraInfraCommands?: string[];
  commandMappings?: Array<{
    executable: string;
    subcommands?: string[];
    tool?: string;
    category?: string;
    signals: CommandSignal[];
    suggestedRisk?: CommandRisk;
  }>;
  extraDetectors?: CommandDetector[];
};

export type NormalizedCommandGuardOptions = {
  extraSensitivePaths: string[];
  extraInfraCommands: string[];
  commandMappings: Array<{
    executable: string;
    subcommands?: string[];
    tool?: string;
    category?: string;
    signals: CommandSignal[];
    suggestedRisk?: CommandRisk;
  }>;
  extraDetectors: CommandDetector[];
};
