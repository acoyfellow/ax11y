import { createContext } from "./context.js";
import { loadTarget } from "./loader.js";
import { rule as entryResolves } from "./rules/entry-resolves.js";
import { rule as errorsActionable } from "./rules/errors-actionable.js";
import { rule as exportsDocumented } from "./rules/exports-documented.js";
import { rule as llmsTxt } from "./rules/llms-txt.js";
import { rule as readmeExamplesTypecheck } from "./rules/readme-examples-typecheck.js";
import { rule as readmeImportsExist } from "./rules/readme-imports-exist.js";
import { rule as readmePresent } from "./rules/readme-present.js";
import { rule as typesPresent } from "./rules/types-present.js";
import type { Finding, Level, Rule } from "./types.js";

const rules: Rule[] = [readmePresent, entryResolves, typesPresent, readmeImportsExist, readmeExamplesTypecheck, llmsTxt, exportsDocumented, errorsActionable];
const order: Array<Level | "none"> = ["none", "A", "AA", "AAA"];

export type Report = { target: string; package: { name: string; version: string }; findings: Finding[]; level: Level | "none"; rules: Array<{ id: string; level: Level; status: "pass" | "fail" | "skip" }> };

export function checkDirectory(directory: string, target: string): Report {
  const context = createContext(directory);
  const findings = rules.flatMap((rule) => rule.run(context));
  const failed = new Set(findings.map((finding) => finding.rule));
  const minimum = findings.reduce<number>((value, finding) => Math.min(value, order.indexOf(finding.level)), 4);
  return {
    target,
    package: { name: context.packageName, version: typeof context.packageJson.version === "string" ? context.packageJson.version : "" },
    findings,
    level: order[minimum - 1] ?? "AAA",
    rules: rules.map((rule) => ({ id: rule.id, level: rule.level, status: failed.has(rule.id) ? "fail" : "pass" })),
  };
}

export async function check(target: string): Promise<Report> {
  const loaded = loadTarget(target);
  try {
    return checkDirectory(loaded.directory, target);
  } finally {
    loaded.cleanup();
  }
}

export function shouldFail(report: Report, failLevel: Level): boolean {
  return report.findings.some((finding) => order.indexOf(finding.level) <= order.indexOf(failLevel));
}

export function formatHuman(report: Report): string {
  const sections = report.findings.map((finding) => `${finding.level} ${finding.rule}  ${finding.file}${finding.line ? `:${finding.line}` : ""}\n${finding.message}\nfix: ${finding.fix}`);
  return [...sections, `level: ${report.level}`].join("\n\n");
}
