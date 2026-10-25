import { afterAll, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p5-"));

test("the render-hello check never searches outside the sandbox for packages", () => {
  const source = readFileSync(join(repo, "tasks", "render-hello", "check.ts"), "utf8");
  expect(source).not.toContain("sibling");
  expect(source).not.toMatch(/readdirSync\(parent\)/);
  expect(source).not.toMatch(/import\.meta\.dir[^\n]*node_modules/);
});

test("a run sandbox for an npm spec installs the package's own runtime dependencies", () => {
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", "cloudterm@0.0.14", "--task", join(import.meta.dir, "tasks", "greet"), "--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "peeks.ts")}`, "--model", "fake-model-1", "--runs", "1", "--keep", "--out", join(scratch, "out"), "--json"], { stdout: "pipe", stderr: "pipe" });
  if (!proc.stdout.toString().trim()) throw new Error(`run printed no JSON: exit=${proc.exitCode} signal=${proc.signalCode} stderr=${proc.stderr.toString().slice(-1500)}`);
  const result = JSON.parse(proc.stdout.toString());
  const sandbox = result.runs[0].sandbox as string;
  try {
    expect(existsSync(join(sandbox, "node_modules", "cloudterm", "package.json"))).toBe(true);
    expect(existsSync(join(sandbox, "node_modules", "@chenglou", "pretext", "package.json"))).toBe(true);
    const seen = JSON.parse(readFileSync(join(sandbox, ".peek.json"), "utf8"));
    expect(seen.parentHasRepo).toBe(false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}, 300000);

test("a run sandbox for a local directory installs its declared dependencies too", () => {
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", join(repo, "fixtures", "clean"), "--task", join(import.meta.dir, "tasks", "greet"), "--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "good.ts")}`, "--model", "fake-model-1", "--runs", "1", "--keep", "--out", join(scratch, "out2"), "--json"], { stdout: "pipe", stderr: "pipe" });
  const result = JSON.parse(proc.stdout.toString());
  expect(result.runs[0].pass).toBe(true);
  rmSync(result.runs[0].sandbox, { recursive: true, force: true });
}, 300000);

test("the build does not depend on a TypeScript config loader", () => {
  const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
  expect(existsSync(join(repo, "tsdown.config.ts"))).toBe(false);
  expect(manifest.scripts.build).toContain("tsdown");
  expect(manifest.scripts.build).not.toContain("--config-loader");
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

test("a run with --out records the sandbox for a target that has dependencies", () => {
  const out = join(scratch, "out3");
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", "cloudterm@0.0.14", "--task", join(import.meta.dir, "tasks", "greet"), "--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "peeks.ts")}`, "--model", "fake-model-1", "--runs", "1", "--out", out, "--json"], { stdout: "pipe", stderr: "pipe" });
  expect(proc.stderr.toString()).not.toContain("EEXIST");
  const result = JSON.parse(proc.stdout.toString());
  const recorded = result.runs[0].sandbox as string;
  expect(recorded.startsWith(out)).toBe(true);
  expect(lstatSync(join(recorded, "node_modules", "cloudterm")).isSymbolicLink()).toBe(false);
  expect(existsSync(join(recorded, "node_modules", "cloudterm", "package.json"))).toBe(true);
  expect(existsSync(join(recorded, "node_modules", "@chenglou", "pretext", "package.json"))).toBe(true);
}, 300000);
