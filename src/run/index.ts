import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTarget } from "../check/loader.js";
import { commandShell } from "./adapters/command.js";
import { parseTranscript, piCommand } from "./adapters/pi.js";
import { inventedImports } from "./invented.js";
import { createSandbox, packageDetails } from "./sandbox.js";

export type RunEntry = { index: number; pass: boolean; tokens: number; costUsd: number; toolCalls: number; turns: number; wallMs: number; timedOut: boolean; inventedImports: string[]; sandbox: string; transcript: string };
export type RunResult = { ax11yVersion: string; agent: string; model: string; task: string; target: { name: string; version: string }; date: string; runs: RunEntry[] };
export type RunOptions = { target: string; task: string; model: string; agent: "pi" | "command"; agentCommand?: string; piExtensions?: string[]; runs: number; timeoutSeconds: number; out?: string; keep?: boolean };

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

export class AgentDidNotStartError extends Error {
  constructor(output: string) {
    super(`The agent did not start: no assistant turn and no tokens. This is a harness error, not a score. Agent output:\n${output.trim().split("\n").slice(-5).join("\n").slice(0, 1200)}`);
  }
}

function moduleDirectory(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function packageRoot(): string {
  const candidates = [join(moduleDirectory(), ".."), join(moduleDirectory(), "..", "..")];
  const root = candidates.find((candidate) => existsSync(join(candidate, "package.json")));
  if (!root) throw new Error("Unable to locate ax11y package.json; reinstall the package and retry.");
  return root;
}

function resolveTask(task: string): string {
  if (existsSync(task)) return task;
  const builtin = join(packageRoot(), "tasks", task);
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
      const transcript = options.out ? join(options.out, `run-${index}`, "transcript.jsonl") : join(sandbox, ".ax11y-transcript.jsonl");
      try {
        const started = performance.now();
        const agent = options.agent === "pi"
          ? { command: "pi", args: piCommand(options.model, options.piExtensions).slice(1) }
          : commandShell(options.agentCommand!);
        const processResult = await execute(agent.command, agent.args, sandbox, prompt, options.timeoutSeconds * 1000);
        mkdirSync(dirname(transcript), { recursive: true });
        writeFileSync(transcript, processResult.output);
        const metrics = parseTranscript(processResult.output);
        if (!processResult.timedOut && metrics.turns === 0 && metrics.tokens === 0) throw new AgentDidNotStartError(processResult.output);
        const check = processResult.timedOut ? { timedOut: true, output: "", code: null } : await execute("bun", [join(taskDirectory, "check.ts")], sandbox, undefined, 120000);
        const sandboxRecord = options.keep || !options.out ? sandbox : join(options.out, `run-${index}`, "sandbox");
        if (sandboxRecord !== sandbox) cpSync(sandbox, sandboxRecord, { recursive: true, dereference: true });
        runs.push({ index, pass: !processResult.timedOut && !check.timedOut && check.code === 0, tokens: metrics.tokens, costUsd: metrics.costUsd, toolCalls: metrics.toolCalls, turns: metrics.turns, wallMs: performance.now() - started, timedOut: processResult.timedOut, inventedImports: inventedImports(sandbox, loaded.directory), sandbox: sandboxRecord, transcript });
      } finally {
        if (!options.keep) rmSync(sandbox, { recursive: true, force: true });
      }
    }
    const packageJson = JSON.parse(readFileSync(join(packageRoot(), "package.json"), "utf8")) as { version: string };
    return { ax11yVersion: packageJson.version, agent: options.agent, model: options.model, task: basename(taskDirectory), target, date: new Date().toISOString(), runs };
  } finally { loaded.cleanup(); }
}
