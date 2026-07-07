import {
  PACKAGE_MANAGER_EXECUTABLES,
  PACKAGE_INSTALL_SUBCOMMANDS,
  PACKAGE_MUTATION_SUBCOMMANDS
} from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

export const packageManagerDetector: CommandDetector = (input) => {
  const { executable, subcommand } = input;

  if (!PACKAGE_MANAGER_EXECUTABLES.includes(executable)) {
    return null;
  }

  // default to npm.exec / package_metadata / low risk
  let tool = "npm.exec";
  let category = "package_metadata";
  let suggestedRisk: "low" | "medium" | "high" = "low";
  const signals: CommandSignal[] = [];

  if (PACKAGE_INSTALL_SUBCOMMANDS.includes(subcommand)) {
    tool = "npm.install";
    category = "package_manager";
    signals.push("package_install", "package_mutation", "network_download");
    suggestedRisk = "medium";
  } else if (PACKAGE_MUTATION_SUBCOMMANDS.includes(subcommand)) {
    tool = "npm.install";
    category = "package_manager";
    signals.push("package_mutation");
    suggestedRisk = "medium";
  } else if (executable === "npx") {
    if (subcommand && !subcommand.startsWith("-")) {
      tool = "npm.exec";
      category = "package_execution";
      signals.push("package_execution", "network_download", "code_execution");
      suggestedRisk = "medium";
    } else {
      tool = "npm.exec";
      category = "package_metadata";
      suggestedRisk = "low";
    }
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["package_manager"]
  };
};
