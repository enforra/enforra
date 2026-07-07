import { normalizeOptions, parseArgv } from "./normalize.js";
import type {
  CommandClassification,
  CommandRisk,
  CommandSignal,
  CommandGuardOptions,
  CommandDetector,
  CommandDetectorInput
} from "./types.js";

import { packageManagerDetector } from "./detectors/package-manager.js";
import { shellDetector } from "./detectors/shell.js";
import { gitDetector } from "./detectors/git.js";
import { networkDetector } from "./detectors/network.js";
import { secretsDetector } from "./detectors/secrets.js";
import { infraDetector } from "./detectors/infra.js";
import { privilegeDetector } from "./detectors/privilege.js";
import { filesDetector } from "./detectors/files.js";

// Re-export all public types and defaults
export * from "./types.js";
export { DEFAULT_SENSITIVE_PATHS } from "./defaults.js";
export { DEFAULT_INFRA_COMMANDS } from "./defaults.js";

const BUILT_IN_DETECTORS: CommandDetector[] = [
  filesDetector,
  secretsDetector,
  privilegeDetector,
  infraDetector,
  gitDetector,
  networkDetector,
  shellDetector,
  packageManagerDetector
];

/**
 * Classify a command represented as an argv array into rich, structured signals and facts.
 *
 * Does NOT execute the command.
 * Does NOT make network calls.
 * Result is deterministic for identical inputs and options.
 */
export function classifyCommand(
  argv: string[],
  options?: CommandGuardOptions
): CommandClassification {
  const parsed = parseArgv(argv);
  const { executable, subcommand, command } = parsed;
  const opts = normalizeOptions(options);

  // Initialize defaults
  let tool = "command.exec";
  let category = "unknown";
  let suggestedRisk: CommandRisk = "low";
  const signalsSet = new Set<CommandSignal>();
  const matchedDetectorsSet = new Set<string>();

  // 1. Run all detectors
  const detectorInput: CommandDetectorInput = {
    executable,
    subcommand,
    command,
    argv,
    options: opts
  };

  const detectors = [...BUILT_IN_DETECTORS, ...opts.extraDetectors];
  const riskLevelOrder: Record<CommandRisk, number> = { low: 1, medium: 2, high: 3 };

  for (const detector of detectors) {
    const res = detector(detectorInput);
    if (res) {
      if (res.tool) tool = res.tool;
      if (res.category) category = res.category;
      if (res.signals) {
        for (const sig of res.signals) {
          signalsSet.add(sig);
        }
      }
      if (res.suggestedRisk) {
        if (riskLevelOrder[res.suggestedRisk] > riskLevelOrder[suggestedRisk]) {
          suggestedRisk = res.suggestedRisk;
        }
      }
      if (res.matchedDetectors) {
        for (const detName of res.matchedDetectors) {
          matchedDetectorsSet.add(detName);
        }
      }
    }
  }

  // 2. Check and merge/override using commandMappings
  for (const mapping of opts.commandMappings) {
    if (mapping.executable === executable) {
      const subcommandsMatch = !mapping.subcommands || mapping.subcommands.includes(subcommand);
      if (subcommandsMatch) {
        if (mapping.tool) tool = mapping.tool;
        if (mapping.category) category = mapping.category;
        if (mapping.suggestedRisk) {
          if (riskLevelOrder[mapping.suggestedRisk] > riskLevelOrder[suggestedRisk]) {
            suggestedRisk = mapping.suggestedRisk;
          }
        }
        for (const sig of mapping.signals) {
          signalsSet.add(sig);
        }
        matchedDetectorsSet.add("command_mappings");
      }
    }
  }

  // 3. Fallback for unknown commands
  if (signalsSet.size === 0 && matchedDetectorsSet.size === 0) {
    signalsSet.add("unknown_command");
    suggestedRisk = "medium";
    tool = "command.exec";
    category = "unknown";
    matchedDetectorsSet.add("unknown");
  }

  // 4. Derive/populate compatibility boolean fields
  const signals = Array.from(signalsSet);
  const matchedDetectors = Array.from(matchedDetectorsSet);

  const destructiveOperation = signals.includes("delete_operation") && suggestedRisk === "high";
  const touchesSensitivePath = signals.includes("sensitive_path_access");
  const readsSecrets = signals.includes("secret_read") || signals.includes("environment_read");
  const writesSecrets = false; // not set by default
  const packageInstall = signals.includes("package_install");
  const packageMutation = signals.includes("package_mutation");
  const networkDownload = signals.includes("network_download");
  const downloadAndExecute = signals.includes("download_and_execute");
  const dataExfiltration = signals.includes("external_transfer");
  const cloudOrInfraAccess = signals.includes("infra_tool");
  const cloudCredentialAccess =
    cloudOrInfraAccess &&
    (command.includes("credentials") ||
      command.includes("token") ||
      command.includes("secret") ||
      command.includes("iam") ||
      command.includes("auth"));
  const privilegeEscalation = signals.includes("privilege_change");
  const workspaceWrite = false; // not set by default
  const unknownCommand = signals.includes("unknown_command");

  return {
    executable,
    subcommand,
    command,
    argv,
    tool,
    category,
    suggestedRisk,
    risk: suggestedRisk, // backward compatibility
    signals,
    matchedDetectors,
    destructiveOperation,
    touchesSensitivePath,
    readsSecrets,
    writesSecrets,
    packageInstall,
    packageMutation,
    networkDownload,
    downloadAndExecute,
    dataExfiltration,
    cloudOrInfraAccess,
    cloudCredentialAccess,
    privilegeEscalation,
    workspaceWrite,
    unknownCommand
  };
}

/**
 * Convenience wrapper returning only `{ tool, risk }` when the full classification is not needed.
 */
export function inferToolAndRisk(
  argv: string[],
  options?: CommandGuardOptions
): { tool: string; risk: CommandRisk } {
  const classification = classifyCommand(argv, options);
  return {
    tool: classification.tool,
    risk: classification.suggestedRisk
  };
}
