import type { CommandDetector, CommandSignal } from "../types.js";

export const packageManagerDetector: CommandDetector = (input) => {
  const { executable, subcommand } = input;
  const pmExecutables = ["npm", "pnpm", "yarn", "bun", "npx"];

  if (!pmExecutables.includes(executable)) {
    return null;
  }

  // default to npm.exec / package_metadata / low risk
  let tool = "npm.exec";
  let category = "package_metadata";
  let suggestedRisk: "low" | "medium" | "high" = "low";
  const signals: CommandSignal[] = [];

  const installSubs = ["install", "i", "add", "ci", "setup"];
  const mutationSubs = ["uninstall", "remove", "rm", "prune", "update", "upgrade"];

  if (installSubs.includes(subcommand)) {
    tool = "npm.install";
    category = "package_manager";
    signals.push("package_install", "package_mutation", "network_download");
    suggestedRisk = "medium";
  } else if (mutationSubs.includes(subcommand)) {
    tool = "npm.install";
    category = "package_manager";
    signals.push("package_mutation");
    suggestedRisk = "medium";
  } else if (executable === "npx") {
    tool = "npm.exec";
    category = "package_metadata";
    suggestedRisk = "low";
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["package_manager"]
  };
};
