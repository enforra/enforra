import type { CommandDetector, CommandSignal } from "../types.js";

function isRecursiveRm(executable: string, argv: string[]): boolean {
  if (executable !== "rm") return false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "--recursive") return true;
    if (arg.startsWith("--")) continue;
    if (arg.startsWith("-") && arg !== "-") {
      const chars = arg.slice(1);
      if (chars.includes("r") || chars.includes("R")) {
        return true;
      }
    }
  }
  return false;
}

export const filesDetector: CommandDetector = (input) => {
  const { executable, command, argv } = input;
  const readExecs = ["cat", "less", "head", "tail", "more"];
  const deleteExecs = ["rm", "rmdir"];
  const writeExecs = ["cp", "mv", "touch", "mkdir", "dd", "mkfs"];

  const shellExecutables = ["sh", "bash", "zsh", "ksh", "csh", "tcsh", "fish", "dash"];
  const isShellOrUnknown =
    shellExecutables.includes(executable) || executable === "" || executable === "command.exec";

  const destructivePatterns = ["rm -rf", "rm -fr", "dd if=", "mkfs"];
  const hasGlobalDestructive =
    isShellOrUnknown &&
    (destructivePatterns.some((p) => command.includes(p)) ||
      /\brm\s+-[a-zA-Z]*[rR]\b/.test(command) ||
      /\brm\s+--recursive\b/.test(command));

  const matchesExecutable =
    readExecs.includes(executable) ||
    deleteExecs.includes(executable) ||
    writeExecs.includes(executable);

  if (!matchesExecutable && !hasGlobalDestructive) {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "low";
  let tool = "file.read";
  let category = "file_access";

  if (hasGlobalDestructive) {
    if (!signals.includes("file_delete")) signals.push("file_delete");
    if (!signals.includes("delete_operation")) signals.push("delete_operation");
    suggestedRisk = "high";
    category = "destructive_operation";
    tool = "file.delete";
  }

  if (matchesExecutable) {
    if (readExecs.includes(executable)) {
      if (!signals.includes("file_read")) signals.push("file_read");
      tool = "file.read";
      category = "file_access";
      if (suggestedRisk !== "high") suggestedRisk = "low";
    } else if (deleteExecs.includes(executable)) {
      if (!signals.includes("file_delete")) signals.push("file_delete");
      if (!signals.includes("delete_operation")) signals.push("delete_operation");
      tool = "file.delete";
      category = "file_access";

      const hasDestructive = isRecursiveRm(executable, argv) || hasGlobalDestructive;

      if (hasDestructive) {
        suggestedRisk = "high";
        category = "destructive_operation";
      } else {
        if (suggestedRisk !== "high") suggestedRisk = "medium";
      }
    } else if (writeExecs.includes(executable)) {
      if (!signals.includes("file_write")) signals.push("file_write");
      tool = "file.write";
      category = "file_access";
      if (suggestedRisk !== "high") suggestedRisk = "medium";

      if (executable === "dd" || executable === "mkfs") {
        if (!signals.includes("delete_operation")) signals.push("delete_operation");
        category = "destructive_operation";
        suggestedRisk = "high";
      }
    }
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["files"]
  };
};
