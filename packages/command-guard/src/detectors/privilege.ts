import type { CommandDetector, CommandSignal } from "../types.js";

export const privilegeDetector: CommandDetector = (input) => {
  const { executable, command } = input;
  const isPrivExec = ["sudo", "su", "chmod", "chown"].includes(executable);

  const hasPrivilegeChange =
    isPrivExec || /\b(sudo|su|chmod\s+777|chown)\b/.test(command) || command.includes("chmod 777");

  if (!hasPrivilegeChange) {
    return null;
  }

  const signals: CommandSignal[] = ["privilege_change"];
  const suggestedRisk: "low" | "medium" | "high" = "high";
  const tool = "system.exec";
  const category = "privilege_change";

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["privilege"]
  };
};
