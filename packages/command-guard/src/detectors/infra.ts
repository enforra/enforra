import {
  DEFAULT_INFRA_COMMANDS,
  INFRA_DELETE_OPERATIONS,
  INFRA_WRITE_OPERATIONS
} from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

export const infraDetector: CommandDetector = (input) => {
  const { executable, command, options } = input;

  const infraCommands = [...DEFAULT_INFRA_COMMANDS, ...options.extraInfraCommands];

  if (!infraCommands.includes(executable)) {
    return null;
  }

  const signals: CommandSignal[] = ["infra_tool"];
  const tool = "infra.exec";
  const category = "infrastructure_access";

  // Check delete operations
  const deleteRegex = new RegExp(`\\b(${INFRA_DELETE_OPERATIONS.join("|")})\\b`);
  if (deleteRegex.test(command)) {
    signals.push("delete_operation");
  }

  // Check write/apply operations (including deploy, rollback)
  const writeRegex = new RegExp(`\\b(${INFRA_WRITE_OPERATIONS.join("|")})\\b`);
  if (writeRegex.test(command)) {
    signals.push("write_operation");
  }

  const hasMutation = signals.includes("delete_operation") || signals.includes("write_operation");
  const suggestedRisk: "low" | "medium" | "high" = hasMutation ? "high" : "medium";

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["infra"]
  };
};
