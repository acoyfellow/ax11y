import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const cli = join(repo, "src", "cli.ts");
const fixture = join(repo, "fixtures", "clean");
const task = join(import.meta.dir, "tasks", "greet");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p6-"));

function run(extra: string[]) {
  const out = join(scratch, `out-${Math.random().toString(36).slice(2, 8)}`);
  const proc = Bun.spawnSync(["bun", cli, "run", fixture, "--task", task, "--model", "fake-model-1", "--runs", "2", "--out", out, "--json", ...extra], { stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), out };
}

test("the pi adapter runs pi without the user's extensions or skills", async () => {
  const module = await import(join(repo, "src", "run", "adapters", "pi.ts"));
  const command = module.piCommand as (model: string, extensions?: string[]) => string[];
  const plain = command("gpt-x");
  expect(plain.slice(0, 3)).toEqual(["pi", "-p", "--no-session"]);
  expect(plain).toContain("--no-extensions");
  expect(plain).toContain("--no-skills");
  expect(plain.join(" ")).toContain("--model gpt-x");
  expect(plain.join(" ")).toContain("--mode json");
  expect(plain).not.toContain("-e");
});

test("--pi-extension loads only the named extensions, in order", async () => {
  const module = await import(join(repo, "src", "run", "adapters", "pi.ts"));
  const command = module.piCommand as (model: string, extensions?: string[]) => string[];
  const withProvider = command("gpt-x", ["/ext/provider", "/ext/second"]);
  expect(withProvider).toContain("--no-extensions");
  const flags = withProvider.flatMap((value, index) => (value === "-e" ? [withProvider[index + 1]] : []));
  expect(flags).toEqual(["/ext/provider", "/ext/second"]);
});

test("the CLI accepts repeated --pi-extension and records them in the result", () => {
  const help = Bun.spawnSync(["bun", cli, "--help"], { stdout: "pipe", stderr: "pipe" });
  expect(help.stdout.toString() + help.stderr.toString()).toContain("--pi-extension");
});

test("an agent that never starts is a harness error, not a failed run", () => {
  const result = run(["--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "never-starts.ts")}`]);
  expect(result.code).not.toBe(0);
  const text = (result.stdout + result.stderr).toLowerCase();
  expect(text).toContain("did not start");
  expect(text).toContain("cannot find module");
  expect(existsSync(join(result.out, "result.json"))).toBe(false);
});

test("an agent that starts and writes a wrong answer is still a scored failure", () => {
  const result = run(["--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "fails.ts")}`]);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.runs.length).toBe(2);
  expect(parsed.runs.every((entry: { pass: boolean }) => !entry.pass)).toBe(true);
  expect(JSON.parse(readFileSync(join(result.out, "result.json"), "utf8")).runs.length).toBe(2);
});

test("a passing agent is unaffected", () => {
  const result = run(["--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "good.ts")}`]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.stdout).runs.every((entry: { pass: boolean }) => entry.pass)).toBe(true);
});

test("the README documents isolation and --pi-extension", () => {
  const readme = readFileSync(join(repo, "README.md"), "utf8");
  expect(readme).toContain("--pi-extension");
  expect(readme.toLowerCase()).toContain("without your extensions");
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
