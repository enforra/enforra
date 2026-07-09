import { SHELL_EXECUTABLES, CODE_EXECUTABLES, PIPE_RUNTIMES } from "../defaults.js";
import type { CommandDetector, CommandSignal } from "../types.js";

const RUNTIME_REGEX = new RegExp(`\\|\\s*(${PIPE_RUNTIMES.join("|")})\\b`);

function isNodeExecutable(executable: string): boolean {
  return executable === "node" || executable === "nodejs";
}

function extractNodeInlineCode(argv: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === "-e" || arg === "--eval" || arg === "-p" || arg === "--print") {
      if (i + 1 < argv.length) {
        return argv[i + 1];
      }
    }
    if (arg.startsWith("-") && !arg.startsWith("--") && arg.length > 1) {
      if (arg.includes("e") || arg.includes("p")) {
        if (i + 1 < argv.length) {
          return argv[i + 1];
        }
      }
    }
  }
  return null;
}

function classifyNodeInlineCode(code: string): {
  tool: string;
  category: string;
  suggestedRisk: "high";
  signals: CommandSignal[];
} | null {
  if (code.includes("process.env")) {
    return {
      tool: "secrets.read",
      category: "secret_access",
      suggestedRisk: "high",
      signals: ["secrets_read_attempt"]
    };
  }
  if (code.includes("readFileSync") && code.includes("/etc/passwd")) {
    return {
      tool: "file.read",
      category: "file_access",
      suggestedRisk: "high",
      signals: ["sensitive_file_read_attempt"]
    };
  }
  if (code.includes("child_process")) {
    return {
      tool: "command.exec",
      category: "code_execution",
      suggestedRisk: "high",
      signals: ["child_process_exec_attempt"]
    };
  }
  return null;
}

export const shellDetector: CommandDetector = (input) => {
  const { executable, command, argv } = input;

  const hasShellPipe = RUNTIME_REGEX.test(command);
  const isShell = SHELL_EXECUTABLES.includes(executable);
  const isCodeExec = CODE_EXECUTABLES.includes(executable) || executable === "bun";

  if (!isShell && !hasShellPipe && !isCodeExec) {
    return null;
  }

  const signals: CommandSignal[] = [];
  let suggestedRisk: "low" | "medium" | "high" = "medium";
  let tool = "command.exec";
  let category = "unknown";

  if (isShell) {
    signals.push("shell_execution");
    tool = "shell.exec";
    category = "shell_command";
  }

  if (isCodeExec) {
    signals.push("code_execution");
    if (isNodeExecutable(executable)) {
      tool = "node.exec";
      category = "code_execution";
      suggestedRisk = "low";

      const code = extractNodeInlineCode(argv);
      if (code) {
        const inlineResult = classifyNodeInlineCode(code);
        if (inlineResult) {
          tool = inlineResult.tool;
          category = inlineResult.category;
          suggestedRisk = inlineResult.suggestedRisk;
          for (const sig of inlineResult.signals) {
            signals.push(sig);
          }
        }
      }
    } else {
      tool = "command.exec";
      category = "code_execution";
      suggestedRisk = "low";
    }
  }

  const hasCurlOrWget = /\b(curl|wget)\b/.test(command);
  if (hasShellPipe && hasCurlOrWget) {
    if (!signals.includes("network_download")) signals.push("network_download");
    if (!signals.includes("download_and_execute")) signals.push("download_and_execute");
    if (!signals.includes("code_execution")) signals.push("code_execution");
    suggestedRisk = "high";
    category = "download_and_execute";
    tool = "network.exec";
  } else if (hasShellPipe) {
    if (!signals.includes("download_and_execute")) signals.push("download_and_execute");
    if (!signals.includes("code_execution")) signals.push("code_execution");
    suggestedRisk = "high";
    category = "download_and_execute";
  }

  return {
    tool,
    category,
    signals,
    suggestedRisk,
    matchedDetectors: ["shell"]
  };
};
