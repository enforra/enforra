import type { DriftCheckResult as CoreResult } from "@enforra/drift-core";

export interface CliDriftReport extends CoreResult {
  baselineFile: string;
  toolsFile: string;
  checkedAt: string;
}

/** Format the drift result into readable plain text. */
export function formatDriftText(result: CliDriftReport): string {
  const lines = [
    "Enforra drift check",
    "",
    `Baseline: ${result.baselineFile}`,
    `Tools:    ${result.toolsFile}`,
    `Checked:  ${result.checkedAt}`,
    "",
    `Baseline tools: ${result.summary.baselineTools}`,
    `Current tools:  ${result.summary.currentTools}`,
    "",
    "Summary:",
    `  High:   ${result.summary.high}`,
    `  Medium: ${result.summary.medium}`,
    `  Low:    ${result.summary.low}`,
    `  Total:  ${result.summary.driftFound}`
  ];

  if (result.drifts.length === 0) {
    lines.push("", "No drift detected.");
  } else {
    lines.push("", "Findings:");
    for (const finding of result.drifts) {
      lines.push(`  [${finding.severity.toUpperCase()}] ${finding.tool}: ${finding.type}`);
      lines.push(`    ${finding.detail}`);
    }
  }

  if (result.affectedPolicies && result.affectedPolicies.length > 0) {
    lines.push("", "Affected Policies:");
    for (const policy of result.affectedPolicies) {
      lines.push(
        `  [${policy.severity.toUpperCase()}] Policy Rule '${policy.policyId}' (tool: ${policy.tool})`
      );
      lines.push(`    Reason: ${policy.reason}`);
      lines.push(`    Action: ${policy.suggestedAction}`);
    }
  }

  return lines.join("\n");
}

/** Format the drift result into GitHub-flavored Markdown. */
export function formatDriftMarkdown(result: CliDriftReport): string {
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
    `| **Total** | **${result.summary.driftFound}** |`
  ];

  if (result.drifts.length === 0) {
    lines.push("", "No drift detected.");
  } else {
    lines.push("", "## Findings", "");
    for (const finding of result.drifts) {
      lines.push(`- **[${finding.severity.toUpperCase()}]** \`${finding.tool}\`: ${finding.type}`);
      lines.push(`  - ${finding.detail}`);
    }
  }

  if (result.affectedPolicies && result.affectedPolicies.length > 0) {
    lines.push("", "## Affected Policies", "");
    for (const policy of result.affectedPolicies) {
      lines.push(
        `- **[${policy.severity.toUpperCase()}]** Policy Rule \`${policy.policyId}\` (tool: \`${policy.tool}\`)`
      );
      lines.push(`  - Reason: ${policy.reason}`);
      lines.push(`  - Action: ${policy.suggestedAction}`);
    }
  }

  return lines.join("\n");
}
