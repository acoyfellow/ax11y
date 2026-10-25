#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDirectory, formatHuman, shouldFail } from "./check/index.js";
import { loadTarget } from "./check/loader.js";
import type { Level } from "./check/types.js";
import { runTarget, type RunResult } from "./run/index.js";
import { compareResults } from "./report/compare.js";
import { json, markdownComparison, markdownReport, textComparison, textReport } from "./report/format.js";
import { summarizeResult } from "./report/summary.js";

const help = `ax11y accessibility checks for coding agents

Usage:
  ax11y check <dir|npm-spec> [--json] [--fail-level A|AA|AAA]
  ax11y run <target> --task <task-dir|builtin-name> --model <model> [--compare <target>] [--agent pi|command] [--agent-command <command>] [--pi-extension <path>]... [--runs N] [--timeout S] [--out DIR] [--keep] [--json]
  ax11y report <result.json> [--json|--format markdown]
  ax11y compare <a.json> <b.json> [--json|--format markdown]
  ax11y tasks
  ax11y --help`;

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function bunAvailable(): boolean {
  const executable = process.platform === "win32" ? "bun.exe" : "bun";
  return (process.env.PATH ?? "").split(delimiter).some((directory) => existsSync(join(directory, executable)));
}

function packageVersion(): string {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return JSON.parse(readFileSync(packagePath, "utf8")).version as string;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function runCommand(args: string[]): Promise<void> {
  if (!bunAvailable()) fail("ax11y run needs bun on PATH to execute task checks (https://bun.sh)", 2);
  const target = args[0];
  const task = option(args, "--task");
  const model = option(args, "--model");
  if (!target || !task) fail("Usage: ax11y run <target> --task <task-dir|builtin-name> --model <model>");
  if (!model) fail("--model is required");
  const agentValue = option(args, "--agent") ?? "pi";
  if (agentValue !== "pi" && agentValue !== "command") fail("--agent must be pi or command");
  const agentCommand = option(args, "--agent-command");
  const piExtensions = args.flatMap((value, index) => (value === "--pi-extension" && args[index + 1] ? [args[index + 1]!] : []));
  if (agentValue === "command" && !agentCommand) fail("--agent-command is required when --agent command");
  const runsValue = option(args, "--runs") ?? "1";
  const timeoutValue = option(args, "--timeout") ?? "600";
  const runs = Number(runsValue);
  const timeoutSeconds = Number(timeoutValue);
  if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a positive integer");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) fail("--timeout must be a positive number");
  const compareTarget = option(args, "--compare");
  const out = option(args, "--out") ?? join("ax11y-results", `${target.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}-${task.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`);
  const settings = { task, model, agent: agentValue, agentCommand, piExtensions, runs, timeoutSeconds, out, keep: args.includes("--keep") } as const;
  let result: RunResult;
  let compared: RunResult | undefined;
  if (compareTarget) {
    const aRuns = [] as RunResult["runs"];
    const bRuns = [] as RunResult["runs"];
    let first: RunResult | undefined;
    let second: RunResult | undefined;
    for (let index = 0; index < runs; index++) {
      const a = await runTarget({ target, ...settings, runs: 1, out: join(out, "a", `run-${index}`) });
      const b = await runTarget({ target: compareTarget, ...settings, runs: 1, out: join(out, "b", `run-${index}`) });
      aRuns.push({ ...a.runs[0]!, index });
      bRuns.push({ ...b.runs[0]!, index });
      first ??= a;
      second ??= b;
    }
    result = { ...first!, runs: aRuns };
    compared = { ...second!, runs: bRuns };
  } else result = await runTarget({ target, ...settings });
  const jsonOutput = args.includes("--json");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
  if (jsonOutput) process.stdout.write(`${json(compared ? { a: result, b: compared, comparison: compareResults(result, compared) } : result)}\n`);
  else {
    for (const entry of result.runs) process.stdout.write(`run ${entry.index + 1}: ${entry.pass ? "pass" : "fail"} (${entry.tokens} tokens)\n`);
    process.stdout.write(`${textReport(summarizeResult(result))}\n`);
    if (compared) process.stdout.write(`${textComparison(compareResults(result, compared))}\n`);
    process.stdout.write(`results: ${out}\n`);
  }
  process.exitCode = compared ? 0 : (result.runs.every((entry) => entry.pass) ? 0 : 1);
}

function readResult(path: string): RunResult {
  return JSON.parse(readFileSync(path, "utf8")) as RunResult;
}

function reportCommand(args: string[]): void {
  if (!args[0]) fail("Usage: ax11y report <result.json> [--json|--format markdown]");
  const summary = summarizeResult(readResult(args[0]));
  process.stdout.write(`${args.includes("--json") ? json(summary) : option(args, "--format") === "markdown" ? markdownReport(summary) : textReport(summary)}\n`);
}

function compareCommand(args: string[]): void {
  if (!args[0] || !args[1]) fail("Usage: ax11y compare <a.json> <b.json> [--json|--format markdown]");
  const comparison = compareResults(readResult(args[0]), readResult(args[1]));
  process.stdout.write(`${args.includes("--json") ? json(comparison) : option(args, "--format") === "markdown" ? markdownComparison(comparison) : textComparison(comparison)}\n`);
}

function run(): void {
  const args = process.argv.slice(2);
  if (args[0] === "--version" || args[0] === "-v") {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${help}\n`);
    return;
  }
  if (args[0] === "tasks") {
    process.stdout.write("basic-import\nrender-hello\n");
    return;
  }
  if (args[0] === "run") {
    runCommand(args.slice(1)).catch((error) => fail(error instanceof Error ? error.message : String(error)));
    return;
  }
  if (args[0] === "report") return reportCommand(args.slice(1));
  if (args[0] === "compare") return compareCommand(args.slice(1));
  if (args[0] !== "check" || !args[1]) fail("Usage: ax11y check <dir|npm-spec> [--json] [--fail-level A|AA|AAA]");
  const target = args[1];
  const json = args.includes("--json");
  const requested = args.indexOf("--fail-level");
  const failLevel = requested === -1 ? "AAA" : args[requested + 1];
  if (failLevel !== "A" && failLevel !== "AA" && failLevel !== "AAA") fail("--fail-level must be A, AA, or AAA");
  let loaded;
  try {
    loaded = loadTarget(target);
    const report = checkDirectory(loaded.directory, target);
    process.stdout.write(`${json ? JSON.stringify(report) : formatHuman(report)}\n`);
    process.exitCode = shouldFail(report, failLevel as Level) ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Unable to check ${target}: ${message}`);
  } finally {
    loaded?.cleanup();
  }
}

run();
