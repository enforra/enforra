import type { CommandDetector, CommandSignal } from "../types.js";

export const gitDetector: CommandDetector = (input) => {
  const { executable, subcommand } = input;

  if (executable !== "git") {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "medium";
  const tool = "git.exec";
  const category = "source_control";

  const readSubs = ["clone", "pull", "fetch", "checkout", "diff", "log", "status"];
  const writeSubs = ["push", "commit", "add", "branch", "merge", "rebase", "tag"];

  if (readSubs.includes(subcommand)) {
    signals.push("source_control_read");
    if (["clone", "pull", "fetch"].includes(subcommand)) {
      signals.push("network_download");
    }
  } else if (writeSubs.includes(subcommand)) {
    signals.push("source_control_write");
    if (subcommand === "push") {
      signals.push("external_transfer");
    }
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["git"]
  };
};
