import {
  PRIVILEGE_EXECUTABLES,
  PRIVILEGE_COMMAND_TOKENS,
  DANGEROUS_CHMOD_MODES
} from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

function isPrivilegeChange(executable: string, argv: string[]): boolean {
  if (PRIVILEGE_EXECUTABLES.includes(executable) && executable !== "chmod") {
    return true;
  }
  // Check argv tokens for standalone sudo, su, or chown
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (PRIVILEGE_COMMAND_TOKENS.includes(token)) {
      return true;
    }
  }

  // Check chmod with mode 777 or broad write permissions
  if (executable === "chmod") {
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg) {
        const hasDangerousMode = DANGEROUS_CHMOD_MODES.some((m) => arg === m || arg.includes(m));
        if (hasDangerousMode) return true;
      }
    }
  } else {
    // If chmod appears inside argv (e.g. nested in shell command)
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "chmod") {
        for (let j = i + 1; j < argv.length; j++) {
          const arg = argv[j];
          if (arg) {
            const hasDangerousMode = DANGEROUS_CHMOD_MODES.some(
              (m) => arg === m || arg.includes(m)
            );
            if (hasDangerousMode) return true;
          }
        }
      }
    }
  }

  return false;
}

function checkCommandStringPrivilege(command: string): boolean {
  const tokens = command.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    const cleanToken = token.replace(/^['"]|['"]$/g, "");
    if (PRIVILEGE_COMMAND_TOKENS.includes(cleanToken)) {
      return true;
    }
    if (cleanToken === "chmod") {
      for (let j = i + 1; j < tokens.length; j++) {
        const next = tokens[j]?.replace(/^['"]|['"]$/g, "");
        if (next) {
          const hasDangerousMode = DANGEROUS_CHMOD_MODES.some(
            (m) => next === m || next.includes(m)
          );
          if (hasDangerousMode) return true;
        }
      }
    }
  }
  return false;
}

export const privilegeDetector: CommandDetector = (input) => {
  const { executable, command, argv } = input;

  const hasPrivilege = isPrivilegeChange(executable, argv) || checkCommandStringPrivilege(command);

  if (!hasPrivilege) {
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
