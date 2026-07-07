import type { CommandDetector, CommandSignal } from "../types.js";

export const DEFAULT_INFRA_COMMANDS = [
  "aws",
  "gcloud",
  "az",
  "kubectl",
  "docker",
  "ssh",
  "terraform",
  "helm"
];

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
  const deletePatterns = /\b(delete|destroy|terminate|rm)\b/;
  if (deletePatterns.test(command)) {
    signals.push("delete_operation");
  }

  // Check write/apply operations (including deploy, rollback)
  const writePatterns = /\b(apply|create|update|put|set|deploy|rollback)\b/;
  if (writePatterns.test(command)) {
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
