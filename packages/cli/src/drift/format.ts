import type { DriftCheckResult } from "./types.js";

/** Format the drift result into readable plain text. */
export function formatDriftText(result: DriftCheckResult): string {
  const lines = [
    "Enforra drift check",
    "",
    `Baseline: ${result.baselineFile}`,
    `Tools:    ${result.toolsFile}`,
    `Checked:  ${result.checkedAt}`,
    "",
    `Baseline tools: ${result.baselineTools}`,
    `Current tools:  ${result.totalTools}`,
    "",
    "Summary:",
    `  High:   ${result.summary.high}`,
    `  Medium: ${result.summary.medium}`,
    `  Low:    ${result.summary.low}`,
    `  Total:  ${result.summary.total}`
  ];

  if (result.findings.length === 0) {
    lines.push("", "No drift detected.");
  } else {
    lines.push("", "Findings:");
    for (const finding of result.findings) {
      lines.push(`  [${finding.severity.toUpperCase()}] ${finding.tool}: ${finding.type}`);
      lines.push(`    ${finding.detail}`);
    }
  }

  return lines.join("\n");
}

/** Format the drift result into GitHub-flavored Markdown. */
export function formatDriftMarkdown(result: DriftCheckResult): string {
  const lines = [
    "# Enforra Drift Check",
    "",
    `Baseline: \`${result.baselineFile}\``,
    `Tools: \`${result.toolsFile}\``,
    `Checked: ${result.checkedAt}`,
    "",
    "## Summary",
    "",
    "| Severity | Count |",
    "| --- | ---: |",
    `| High | ${result.summary.high} |`,
    `| Medium | ${result.summary.medium} |`,
    `| Low | ${result.summary.low} |`,
    `| **Total** | **${result.summary.total}** |`
  ];

  if (result.findings.length === 0) {
    lines.push("", "No drift detected.");
  } else {
    lines.push("", "## Findings", "");
    for (const finding of result.findings) {
      lines.push(`- **[${finding.severity.toUpperCase()}]** \`${finding.tool}\`: ${finding.type}`);
      lines.push(`  - ${finding.detail}`);
    }
  }

  return lines.join("\n");
}
