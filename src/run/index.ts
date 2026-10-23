import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTarget } from "../check/loader.js";
import { commandShell } from "./adapters/command.js";
import { parseTranscript, piCommand } from "./adapters/pi.js";
import { inventedImports } from "./invented.js";
import { createSandbox, packageDetails } from "./sandbox.js";

export type RunEntry = { index: number; pass: boolean; tokens: number; costUsd: number; toolCalls: number; turns: number; wallMs: number; timedOut: boolean; inventedImports: string[]; sandbox: string; transcript: string };
export type RunResult = { ax11yVersion: string; agent: string; model: string; task: string; target: { name: string; version: string }; date: string; runs: RunEntry[] };
export type RunOptions = { target: string; task: string; model: string; agent: "pi" | "command"; agentCommand?: string; runs: number; timeoutSeconds: number };

type ProcessResult = { output: string; timedOut: boolean; code: number | null };

function execute(command: string, args: string[], cwd: string, input: string | undefined, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    child.stdout.on("data", (data) => { output += String(data); });
    child.stderr.on("data", (data) => { output += String(data); });
    child.on("error", (error) => { output += `${error.message}\n`; });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32") child.kill("SIGKILL");
      else process.kill(-child.pid!, "SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ output, timedOut, code }); });
    child.stdin.end(input);
  });
}

function resolveTask(task: string): string {
  if (existsSync(task)) return task;
  const builtin = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tasks", task);
  if (existsSync(builtin)) return builtin;
  throw new Error(`Task not found: ${task}`);
}

export async function runTarget(options: RunOptions): Promise<RunResult> {
  const loaded = loadTarget(options.target);
  try {
    const target = packageDetails(loaded.directory);
    const taskDirectory = resolveTask(options.task);
    const template = readFileSync(join(taskDirectory, "task.md"), "utf8");
    const prompt = template.replaceAll("{{package}}", JSON.stringify(target.name));
    const runs: RunEntry[] = [];
    for (let index = 0; index < options.runs; index++) {
      const sandbox = createSandbox(loaded.directory, target.name, existsSync(join(taskDirectory, "setup")) ? join(taskDirectory, "setup") : undefined);
      const started = performance.now();
      const agent = options.agent === "pi"
        ? { command: "pi", args: piCommand(options.model).slice(1) }
        : commandShell(options.agentCommand!);
      const processResult = await execute(agent.command, agent.args, sandbox, prompt, options.timeoutSeconds * 1000);
      const transcript = join(sandbox, ".ax11y-transcript.jsonl");
      writeFileSync(transcript, processResult.output);
      const metrics = parseTranscript(processResult.output);
      const check = processResult.timedOut ? { timedOut: true, output: "", code: null } : await execute("bun", [join(taskDirectory, "check.ts")], sandbox, undefined, 120000);
      runs.push({ index, pass: !processResult.timedOut && !check.timedOut && check.code === 0, tokens: metrics.tokens, costUsd: metrics.costUsd, toolCalls: metrics.toolCalls, turns: metrics.turns, wallMs: performance.now() - started, timedOut: processResult.timedOut, inventedImports: inventedImports(sandbox, loaded.directory), sandbox, transcript });
    }
    return { ax11yVersion: "0.0.0", agent: options.agent, model: options.model, task: basename(taskDirectory), target, date: new Date().toISOString(), runs };
  } finally { loaded.cleanup(); }
}

export function summarize(result: RunResult): string {
  const passed = result.runs.filter((run) => run.pass).length;
  const tokens = result.runs.map((run) => run.tokens).sort((a, b) => a - b);
  const median = tokens.length % 2 ? tokens[(tokens.length - 1) / 2]! : (tokens[tokens.length / 2 - 1]! + tokens[tokens.length / 2]!) / 2;
  return `${passed}/${result.runs.length} passed; median tokens ${median}`;
}
