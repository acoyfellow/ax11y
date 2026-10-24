import type { Comparison } from "./compare.js";
import type { ReportSummary } from "./summary.js";

export function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item === Infinity ? "Infinity" : item);
}

export function textReport(summary: ReportSummary): string {
  return `${summary.target.name}@${summary.target.version}\n${summary.passes}/${summary.runs} passed (${(summary.passRate * 100).toFixed(1)}%)\ntokens: median ${summary.tokens.median}, IQR ${summary.tokens.q1}-${summary.tokens.q3}\nturns: median ${summary.turns.median}`;
}

export function markdownReport(summary: ReportSummary): string {
  const date = summary.date.slice(0, 10);
  return `# ${summary.target.name}@${summary.target.version}\n\n| Metric | Value |\n| --- | --- |\n| Pass rate | ${summary.passes}/${summary.runs} (${(summary.passRate * 100).toFixed(1)}%) |\n| Tokens median | ${summary.tokens.median} |\n| Tokens IQR | ${summary.tokens.q1}–${summary.tokens.q3} |\n| Turns median | ${summary.turns.median} |\n| Cost median | ${summary.costUsd.median} |\n\nagent ${summary.agent}, model ${summary.model}, task ${summary.task}, ${summary.runs} runs, ${date}, ax11y ${summary.ax11yVersion}`;
}

export function textComparison(comparison: Comparison): string {
  return `p ${comparison.p}, U ${comparison.u}, ${comparison.method}; median A ${comparison.medianA}, median B ${comparison.medianB}; ${comparison.direction}`;
}

export function markdownComparison(comparison: Comparison): string {
  return `| Metric | Value |\n| --- | --- |\n| p | ${comparison.p} |\n| U | ${comparison.u} |\n| Method | ${comparison.method} |\n| Median A | ${comparison.medianA} |\n| Median B | ${comparison.medianB} |\n| Significant | ${comparison.significant} |\n| Direction | ${comparison.direction} |`;
}
