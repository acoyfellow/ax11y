import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p4b-"));
const api = await import(join(repo, "src", "index.ts"));

test("check(target) takes one argument: a directory or an npm spec, and resolves to a Report", async () => {
  expect(api.check.length).toBeLessThanOrEqual(2);
  const local = await api.check(join(repo, "fixtures", "clean"));
  expect(local.level).toBe("AAA");
  expect(local.package).toEqual({ name: "greeter-fixture", version: "1.0.0" });
  const remote = await api.check("cloudterm@0.0.14");
  expect(remote.package).toEqual({ name: "cloudterm", version: "0.0.14" });
}, 120000);

test("summarize returns the structured summary; there is no second summarize-like export", () => {
  const summary = api.summarize({ ax11yVersion: "0.1.0", agent: "pi", model: "m", task: "t", target: { name: "x", version: "1.0.0" }, date: "2026-10-24T00:00:00.000Z", runs: [{ index: 0, pass: true, tokens: 10, costUsd: 0, toolCalls: 1, turns: 1, wallMs: 1, timedOut: false, inventedImports: [], sandbox: "", transcript: "" }] });
  expect(typeof summary).toBe("object");
  expect(summary.passes).toBe(1);
  expect(summary.tokens.median).toBe(10);
  expect(Object.keys(api).filter((name) => /summar/i.test(name))).toEqual(["summarize"]);
});

test("the public API names match the README's API list exactly", () => {
  const readme = readFileSync(join(repo, "README.md"), "utf8");
  const valueExports = Object.keys(api).sort();
  for (const name of valueExports) expect(readme).toContain(`\`${name}\``);
  expect(valueExports).toEqual(expect.arrayContaining(["check", "run", "summarize", "compare", "rules"]));
});

test("the README library example calls check with one argument and type-checks", () => {
  const readme = readFileSync(join(repo, "README.md"), "utf8");
  const block = readme.match(/```ts\n([\s\S]*?)```/)?.[1] ?? "";
  expect(block).toContain("from \"ax11y\"");
  expect(block).toMatch(/await check\("[^"]+"\)/);
  expect(block).not.toMatch(/check\("[^"]*",\s*"/);
});

test("run deletes sandboxes after each run unless --keep is given, and says where results are", () => {
  const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("ax11y-run-")));
  const out = join(scratch, "out");
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", join(repo, "fixtures", "clean"), "--task", join(import.meta.dir, "tasks", "greet"), "--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "good.ts")}`, "--model", "fake-model-1", "--runs", "2", "--out", out, "--json"], { stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).toBe(0);
  const result = JSON.parse(proc.stdout.toString());
  const after = readdirSync(tmpdir()).filter((name) => name.startsWith("ax11y-run-") && !before.has(name));
  expect(after).toEqual([]);
  for (const entry of result.runs) {
    expect(existsSync(entry.transcript)).toBe(true);
    expect(entry.transcript.startsWith(out)).toBe(true);
  }
  expect(existsSync(join(out, "result.json"))).toBe(true);
}, 120000);

test("--keep keeps the sandbox", () => {
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", join(repo, "fixtures", "clean"), "--task", join(import.meta.dir, "tasks", "greet"), "--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "good.ts")}`, "--model", "fake-model-1", "--runs", "1", "--keep", "--json"], { stdout: "pipe", stderr: "pipe" });
  const result = JSON.parse(proc.stdout.toString());
  expect(existsSync(join(result.runs[0].sandbox, "solution.mjs"))).toBe(true);
  rmSync(result.runs[0].sandbox, { recursive: true, force: true });
}, 120000);

test("README tells the user how to install chrome-headless-shell and where results go", () => {
  const readme = readFileSync(join(repo, "README.md"), "utf8");
  expect(readme).toMatch(/playwright install[^\n]*chromium-headless-shell|playwright install --only-shell/);
  expect(readme).toContain("--out");
  expect(readme).toContain("--keep");
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
