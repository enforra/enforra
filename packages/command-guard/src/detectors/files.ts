import type { CommandDetector, CommandSignal } from "../types.js";

export const filesDetector: CommandDetector = (input) => {
  const { executable, command } = input;
  const readExecs = ["cat", "less", "head", "tail", "more"];
  const deleteExecs = ["rm", "rmdir"];
  const writeExecs = ["cp", "mv", "touch", "mkdir", "dd", "mkfs"];

  const destructivePatterns = ["rm -rf", "rm -fr", "dd if=", "mkfs"];
  const hasGlobalDestructive = destructivePatterns.some((p) => command.includes(p));

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
    signals.push("file_delete", "delete_operation");
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

      const hasDestructive =
        /rm\s+-r[fF]/.test(command) ||
        command.includes("rm -rf") ||
        command.includes("rm -fr") ||
        hasGlobalDestructive;

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
