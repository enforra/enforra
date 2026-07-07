import {
  GIT_READ_SUBCOMMANDS,
  GIT_WRITE_SUBCOMMANDS,
  GIT_NETWORK_READ_SUBCOMMANDS,
  GIT_EXTERNAL_TRANSFER_SUBCOMMANDS
} from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

export const gitDetector: CommandDetector = (input) => {
  const { executable, subcommand } = input;

  if (executable !== "git") {
    return null;
  }

  const signals: CommandSignal[] = [];
  const suggestedRisk: "low" | "medium" | "high" = "medium";
  const tool = "git.exec";
  const category = "source_control";

  if (GIT_READ_SUBCOMMANDS.includes(subcommand)) {
    signals.push("source_control_read");
    if (GIT_NETWORK_READ_SUBCOMMANDS.includes(subcommand)) {
      signals.push("network_download");
    }
  } else if (GIT_WRITE_SUBCOMMANDS.includes(subcommand)) {
    signals.push("source_control_write");
    if (GIT_EXTERNAL_TRANSFER_SUBCOMMANDS.includes(subcommand)) {
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
