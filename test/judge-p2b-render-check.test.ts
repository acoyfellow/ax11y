import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const solutions = join(import.meta.dir, "render-solutions");
const check = join(repo, "tasks", "render-hello", "check.ts");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p2b-"));
const installed = join(scratch, "installed");
mkdirSync(installed, { recursive: true });
writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "sandbox", private: true, type: "module", dependencies: { cloudterm: "0.0.14" } }));
const install = Bun.spawnSync(["npm", "install", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: installed, stdout: "pipe", stderr: "pipe" });
if (install.exitCode !== 0) throw new Error(`npm install cloudterm@0.0.14 failed: ${install.stderr.toString().slice(-400)}`);

function sandboxFor(solution: string): string {
  const dir = join(scratch, `${solution}-${Math.random().toString(36).slice(2, 8)}`);
  cpSync(installed, dir, { recursive: true });
  cpSync(join(solutions, solution), dir, { recursive: true });
  return dir;
}

function runCheck(dir: string): { code: number; seconds: number; output: string } {
  const started = performance.now();
  const result = Bun.spawnSync(["bun", check], { cwd: dir, stdout: "pipe", stderr: "pipe", timeout: 180000 });
  return { code: result.exitCode, seconds: (performance.now() - started) / 1000, output: result.stdout.toString() + result.stderr.toString() };
}

test("render-hello check source drives a real browser, not text matching", () => {
  const source = readFileSync(check, "utf8");
  expect(source).toMatch(/Runtime\.evaluate|page\.evaluate/);
  expect(source).toMatch(/Input\.insertText|keyboard\.type|Input\.dispatchKeyEvent/);
  expect(source).not.toMatch(/source\.includes\(\s*["'`]termWrite/);
});

test("a correct cloudterm solution passes", () => {
  const { code, output } = runCheck(sandboxFor("good"));
  if (code !== 0) console.log(output.slice(-800));
  expect(code).toBe(0);
}, 200000);

describe("each broken solution fails", () => {
  for (const solution of ["no-write", "no-globals", "input-broken", "syntax-error", "words-only", "string-input"]) {
    test(solution, () => {
      const { code, output } = runCheck(sandboxFor(solution));
      expect(code).not.toBe(0);
      expect(output.length).toBeGreaterThan(0);
    }, 200000);
  }
});

test("the task prompt states every requirement the check enforces", () => {
  const prompt = readFileSync(join(repo, "tasks", "render-hello", "task.md"), "utf8");
  expect(prompt).toContain("AX11Y-HELLO");
  expect(prompt).toContain("window.termWrite");
  expect(prompt).toContain("window.termInput");
  expect(prompt).toMatch(/termInput[^\n]*an array/);
  expect(prompt).toContain("{{package}}");
});

test("the check names what failed", () => {
  const output = runCheck(sandboxFor("input-broken")).output.toLowerCase();
  expect(output).toMatch(/input/);
}, 200000);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
