import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const fixture = join(repo, "fixtures", "clean");
const task = join(import.meta.dir, "tasks", "greet");
const fakes = join(import.meta.dir, "fake-agents");
const outRoot = mkdtempSync(join(tmpdir(), "ax11y-p2-"));

type Run = {
  index: number;
  pass: boolean;
  tokens: number;
  costUsd: number;
  toolCalls: number;
  turns: number;
  wallMs: number;
  timedOut: boolean;
  inventedImports: string[];
  sandbox: string;
  transcript: string;
};
type RunResult = {
  ax11yVersion: string;
  agent: string;
  model: string;
  task: string;
  target: { name: string; version: string };
  date: string;
  runs: Run[];
};

function run(agentScript: string, extra: string[] = [], runs = 2): { code: number; result: RunResult; stderr: string } {
  const out = join(outRoot, `${agentScript}-${Math.random().toString(36).slice(2, 8)}`);
  const proc = Bun.spawnSync(
    ["bun", join(repo, "src", "cli.ts"), "run", fixture, "--task", task, "--agent", "command", "--agent-command", `bun ${join(fakes, agentScript)}`, "--model", "fake-model-1", "--runs", String(runs), "--out", out, "--json", ...extra],
    { stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } },
  );
  const stdout = proc.stdout.toString();
  let result: RunResult;
  try {
    result = JSON.parse(stdout);
  } catch {
    throw new Error(`run --json did not print JSON (exit ${proc.exitCode}). stdout: ${stdout.slice(0, 400)} stderr: ${proc.stderr.toString().slice(0, 600)}`);
  }
  return { code: proc.exitCode, result, stderr: proc.stderr.toString() };
}

test("a correct agent passes every run, with exact token, cost, tool and turn counts from final assistant messages only", () => {
  const { code, result } = run("good.ts");
  expect(code).toBe(0);
  expect(result.agent).toBe("command");
  expect(result.model).toBe("fake-model-1");
  expect(result.task).toBe("greet");
  expect(result.target).toEqual({ name: "greeter-fixture", version: "1.0.0" });
  expect(Number.isNaN(Date.parse(result.date))).toBe(false);
  expect(result.ax11yVersion).toMatch(/^\d+\.\d+\.\d+/);
  expect(result.runs.length).toBe(2);
  for (const entry of result.runs) {
    expect(entry.pass).toBe(true);
    expect(entry.tokens).toBe(2000);
    expect(entry.costUsd).toBeCloseTo(0.015, 6);
    expect(entry.toolCalls).toBe(2);
    expect(entry.turns).toBe(2);
    expect(entry.timedOut).toBe(false);
    expect(entry.inventedImports).toEqual([]);
    expect(entry.wallMs).toBeGreaterThan(0);
  }
}, 120000);

test("the prompt substitutes the package name and the sandbox has the package installed and nothing else", () => {
  const { result } = run("good.ts", [], 1);
  const sandbox = result.runs[0]!.sandbox;
  const prompt = readFileSync(join(sandbox, ".prompt-seen.txt"), "utf8");
  expect(prompt).toContain('"greeter-fixture"');
  expect(prompt).not.toContain("{{package}}");
  expect(existsSync(join(sandbox, "node_modules", "greeter-fixture", "package.json"))).toBe(true);
  expect(existsSync(join(sandbox, "node_modules", "greeter-fixture", "README.md"))).toBe(true);
  expect(readdirSync(join(sandbox, "node_modules"))).toEqual(["greeter-fixture"]);
  expect(existsSync(join(sandbox, "check.ts"))).toBe(false);
  expect(existsSync(join(sandbox, "task.md"))).toBe(false);
}, 120000);

test("the sandbox is outside the target and outside any repository", () => {
  const { result } = run("peeks.ts", [], 1);
  const seen = JSON.parse(readFileSync(join(result.runs[0]!.sandbox, ".peek.json"), "utf8"));
  expect(seen.parentHasRepo).toBe(false);
  expect(seen.cwdEntries.filter((entry: string) => !entry.startsWith("."))).toEqual(["node_modules", "package.json"]);
  expect(result.runs[0]!.sandbox.startsWith(repo)).toBe(false);
}, 120000);

test("invented imports are detected by name, including renamed imports and mixed lines", () => {
  const { result, code } = run("invents.ts", [], 1);
  const entry = result.runs[0]!;
  expect(entry.inventedImports).toEqual(["welcome"]);
  expect(entry.tokens).toBe(500);
  expect(code).not.toBe(0);
}, 120000);

test("a wrong answer fails the deterministic check", () => {
  const { result, code } = run("fails.ts", [], 1);
  expect(result.runs[0]!.pass).toBe(false);
  expect(result.runs[0]!.tokens).toBe(300);
  expect(code).not.toBe(0);
}, 120000);

test("a hung agent is killed at the timeout, counted as a failed run, and reported as timedOut", () => {
  const started = performance.now();
  const { result } = run("hangs.ts", ["--timeout", "3"], 1);
  const seconds = (performance.now() - started) / 1000;
  expect(seconds).toBeLessThan(30);
  expect(result.runs[0]!.timedOut).toBe(true);
  expect(result.runs[0]!.pass).toBe(false);
}, 120000);

test("every run keeps its full agent transcript on disk", () => {
  const { result } = run("good.ts", [], 1);
  const transcript = readFileSync(result.runs[0]!.transcript, "utf8");
  expect(transcript).toContain("turn_end");
}, 120000);

test("the pi adapter counts tokens from a real pi --mode json transcript correctly", async () => {
  const module = await import(join(repo, "src", "run", "adapters", "pi.ts"));
  const parse = module.parseTranscript as (text: string) => { tokens: number; costUsd: number; toolCalls: number; turns: number };
  const parsed = parse(readFileSync(join(import.meta.dir, "data", "pi-transcript.jsonl"), "utf8"));
  expect(parsed.tokens).toBe(26471);
  expect(parsed.costUsd).toBeCloseTo(0.0362244, 6);
  expect(parsed.toolCalls).toBe(1);
  expect(parsed.turns).toBe(2);
});

test("the pi adapter builds the documented command with the model", async () => {
  const module = await import(join(repo, "src", "run", "adapters", "pi.ts"));
  const command = module.piCommand as (model: string) => string[];
  expect(command("gpt-x")).toEqual(["pi", "-p", "--no-session", "--model", "gpt-x", "--mode", "json"]);
});

test("--model is required; a missing model is a clear error", () => {
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", fixture, "--task", task], { stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).not.toBe(0);
  expect((proc.stdout.toString() + proc.stderr.toString()).toLowerCase()).toContain("--model");
});

test("built-in tasks ship with the package and are listed", () => {
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "tasks"], { stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).toBe(0);
  const output = proc.stdout.toString();
  expect(output).toContain("render-hello");
  expect(output).toContain("basic-import");
  for (const name of ["render-hello", "basic-import"]) {
    expect(existsSync(join(repo, "tasks", name, "task.md"))).toBe(true);
    expect(existsSync(join(repo, "tasks", name, "check.ts"))).toBe(true);
  }
});

afterAll(() => rmSync(outRoot, { recursive: true, force: true }));
