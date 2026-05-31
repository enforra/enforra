import { formatPolicyTestRun, formatPolicyTestRunJson, runPolicyTestsFromFiles } from "./index.js";

interface CliOptions {
  policyPath: string;
  casesPath: string;
  trace: boolean;
  json: boolean;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await runPolicyTestsFromFiles(options.policyPath, options.casesPath, {
    trace: options.trace
  });
  if (options.json) {
    console.log(formatPolicyTestRunJson(result));
  } else {
    console.log(formatPolicyTestRun(result));
  }

  if (!result.passed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

/**
 * Parse command-line arguments into CLI options for the policy simulator.
 *
 * @param args - Array of command-line arguments (typically process.argv.slice(2)); looks for `--policy <path>`, `--cases <path>`, `--trace`, and `--json`.
 * @returns An object with `policyPath` and `casesPath` taken from the values following `--policy` and `--cases`, and boolean flags `trace` and `json` indicating presence of `--trace` and `--json`.
 * @throws Error if either `--policy <path>` or `--cases <path>` is missing; the thrown error message contains the expected usage.
 */
function parseArgs(args: string[]): CliOptions {
  const policyPath = readOption(args, "--policy");
  const casesPath = readOption(args, "--cases");

  if (policyPath === undefined || casesPath === undefined) {
    throw new Error(
      "usage: enforra-policy-simulator --policy <policy.yaml> --cases <cases.yaml> [--json] [--trace]"
    );
  }

  return {
    policyPath,
    casesPath,
    trace: args.includes("--trace"),
    json: args.includes("--json")
  };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}
