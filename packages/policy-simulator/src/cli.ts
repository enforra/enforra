import { formatPolicyTestRun, runPolicyTestsFromFiles } from "./index.js";

interface CliOptions {
  policyPath: string;
  casesPath: string;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await runPolicyTestsFromFiles(options.policyPath, options.casesPath);
  console.log(formatPolicyTestRun(result));

  if (!result.passed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args: string[]): CliOptions {
  const policyPath = readOption(args, "--policy");
  const casesPath = readOption(args, "--cases");

  if (policyPath === undefined || casesPath === undefined) {
    throw new Error("usage: enforra-policy-simulator --policy <policy.yaml> --cases <cases.yaml>");
  }

  return {
    policyPath,
    casesPath
  };
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}
