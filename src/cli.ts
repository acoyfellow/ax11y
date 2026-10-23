#!/usr/bin/env node
import { checkDirectory, formatHuman, shouldFail } from "./check/index.js";
import { loadTarget } from "./check/loader.js";
import type { Level } from "./check/types.js";
import { runTarget, summarize } from "./run/index.js";

const help = `ax11y accessibility checks for coding agents

Usage:
  ax11y check <dir|npm-spec> [--json] [--fail-level A|AA|AAA]
  ax11y run <target> --task <task-dir|builtin-name> --model <model> [--agent pi|command] [--agent-command <command>] [--runs N] [--timeout S] [--out DIR] [--json]
  ax11y tasks
  ax11y --help`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function runCommand(args: string[]): Promise<void> {
  const target = args[0];
  const task = option(args, "--task");
  const model = option(args, "--model");
  if (!target || !task) fail("Usage: ax11y run <target> --task <task-dir|builtin-name> --model <model>");
  if (!model) fail("--model is required");
  const agentValue = option(args, "--agent") ?? "pi";
  if (agentValue !== "pi" && agentValue !== "command") fail("--agent must be pi or command");
  const agentCommand = option(args, "--agent-command");
  if (agentValue === "command" && !agentCommand) fail("--agent-command is required when --agent command");
  const runsValue = option(args, "--runs") ?? "1";
  const timeoutValue = option(args, "--timeout") ?? "600";
  const runs = Number(runsValue);
  const timeoutSeconds = Number(timeoutValue);
  if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a positive integer");
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) fail("--timeout must be a positive number");
  const result = await runTarget({ target, task, model, agent: agentValue, agentCommand, runs, timeoutSeconds });
  const json = args.includes("--json");
  const out = option(args, "--out");
  if (out) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "result.json"), JSON.stringify(result, null, 2) + "\n");
  }
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    for (const entry of result.runs) process.stdout.write(`run ${entry.index + 1}: ${entry.pass ? "pass" : "fail"} (${entry.tokens} tokens)\n`);
    process.stdout.write(`${summarize(result)}\n`);
  }
  process.exitCode = result.runs.every((entry) => entry.pass) ? 0 : 1;
}

function run(): void {
  const args = process.argv.slice(2);
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
