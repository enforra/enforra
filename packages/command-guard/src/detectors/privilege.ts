import type { CommandDetector, CommandSignal } from "../types.js";

function isPrivilegeChange(executable: string, argv: string[]): boolean {
  if (executable === "sudo" || executable === "su" || executable === "chown") {
    return true;
  }
  // Check argv tokens for standalone sudo, su, or chown
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === "sudo" || token === "su" || token === "chown") {
      return true;
    }
  }

  // Check chmod with mode 777 or broad write permissions
  if (executable === "chmod") {
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg && (arg === "777" || arg.includes("777") || arg === "a+w" || arg === "o+w")) {
        return true;
      }
    }
  } else {
    // If chmod appears inside argv (e.g. nested in shell command)
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "chmod") {
        for (let j = i + 1; j < argv.length; j++) {
          const arg = argv[j];
          if (arg && (arg === "777" || arg.includes("777") || arg === "a+w" || arg === "o+w")) {
            return true;
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
    // Strip quotes or enclosing characters
    const cleanToken = token.replace(/^['"]|['"]$/g, "");
    if (cleanToken === "sudo" || cleanToken === "su" || cleanToken === "chown") {
      return true;
    }
    if (cleanToken === "chmod") {
      for (let j = i + 1; j < tokens.length; j++) {
        const next = tokens[j]?.replace(/^['"]|['"]$/g, "");
        if (next && (next === "777" || next.includes("777") || next === "a+w" || next === "o+w")) {
          return true;
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
