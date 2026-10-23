#!/usr/bin/env node
import { checkDirectory, formatHuman, shouldFail } from "./check/index.js";
import { loadTarget } from "./check/loader.js";
import type { Level } from "./check/types.js";

const help = `ax11y accessibility checks for coding agents

Usage:
  ax11y check <dir|npm-spec> [--json] [--fail-level A|AA|AAA]
  ax11y run <target> --task <task-dir>
  ax11y --help`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function run(): void {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${help}\n`);
    return;
  }
  if (args[0] === "run") {
    process.stdout.write("not implemented yet\n");
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
