import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p4-"));
const install = join(scratch, "install");
let tarball = "";
let files: string[] = [];

function sh(command: string[], cwd: string, env: Record<string, string> = {}): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1", ...env } });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

beforeAll(() => {
  const build = sh(["bun", "run", "build"], repo);
  if (build.code !== 0) throw new Error(`build failed: ${build.stderr.slice(-800)}`);
  const pack = sh(["npm", "pack", "--json", "--pack-destination", scratch], repo);
  if (pack.code !== 0) throw new Error(`npm pack failed: ${pack.stderr.slice(-800)}`);
  const info = JSON.parse(pack.stdout)[0];
  tarball = join(scratch, info.filename);
  files = info.files.map((file: { path: string }) => file.path).sort();
  sh(["mkdir", "-p", install], scratch);
  writeFileSync(join(install, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  const added = sh(["npm", "install", "--no-audit", "--no-fund", "--ignore-scripts", tarball], install);
  if (added.code !== 0) throw new Error(`npm install failed: ${added.stderr.slice(-800)}`);
}, 300000);

describe("the npm tarball", () => {
  test("ships dist, built-in tasks, README, llms.txt, LICENSE; no tests, fixtures, sources or loop files", () => {
    for (const required of ["README.md", "llms.txt", "LICENSE", "package.json", "dist/cli.js", "tasks/basic-import/task.md", "tasks/basic-import/check.ts", "tasks/render-hello/task.md", "tasks/render-hello/check.ts"]) expect(files).toContain(required);
    const forbiddenTopLevel = new Set(["test", "fixtures", "src", ".git", ".loop-wt", ".github"]);
    for (const file of files) expect(forbiddenTopLevel.has(file.split("/")[0]!) && file.includes("/")).toBe(false);
    expect(files.some((file) => file.endsWith(".d.ts"))).toBe(true);
  });
  test("package.json is complete for npm", () => {
    const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
    expect(manifest.name).toBe("ax11y");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.version).not.toBe("0.0.0");
    expect(manifest.bin.ax11y).toBe("dist/cli.js");
    expect(manifest.repository?.url ?? manifest.repository).toContain("github.com/acoyfellow/ax11y");
    expect(manifest.homepage).toContain("github.com/acoyfellow/ax11y");
    expect(manifest.keywords).toEqual(expect.arrayContaining(["ai", "agents", "accessibility", "llms.txt", "documentation", "lint"]));
    expect(manifest.types ?? manifest.exports?.["."]?.types).toBeTruthy();
    expect(manifest.dependencies.typescript).toBeTruthy();
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["typescript"]);
  });
  test("dist/cli.js starts with a node shebang", () => {
    expect(readFileSync(join(repo, "dist", "cli.js"), "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
  });
});

describe("installed from the tarball, run with node (no bun on PATH)", () => {
  const nodeOnlyPath = () => (process.env.PATH ?? "").split(":").filter((dir) => !existsSync(join(dir, "bun"))).join(":");
  const bin = () => join(install, "node_modules", ".bin", "ax11y");

  test("--help works", () => {
    const { code, stdout } = sh([bin(), "--help"], install, { PATH: nodeOnlyPath() });
    expect(code).toBe(0);
    expect(stdout).toContain("check");
  });

  test("--version prints package.json version", () => {
    const { code, stdout } = sh([bin(), "--version"], install, { PATH: nodeOnlyPath() });
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version);
  });

  test("check reproduces the fixture grid exactly", () => {
    const fixtures = join(repo, "fixtures");
    for (const name of readdirSync(fixtures)) {
      const { stdout } = sh([bin(), "check", join(fixtures, name), "--json"], install, { PATH: nodeOnlyPath() });
      const report = JSON.parse(stdout);
      const flagged = [...new Set(report.findings.map((finding: { rule: string }) => finding.rule))];
      expect(flagged).toEqual(name === "clean" ? [] : [name.replace(/^planted-/, "")]);
    }
  }, 120000);

  test("check of an npm spec works", () => {
    const { stdout } = sh([bin(), "check", "cloudterm@0.0.14", "--json"], install, { PATH: nodeOnlyPath() });
    expect(JSON.parse(stdout).package).toEqual({ name: "cloudterm", version: "0.0.14" });
  }, 120000);

  test("run without bun fails with a clear message naming bun", () => {
    const { code, stdout, stderr } = sh([bin(), "run", join(repo, "fixtures", "clean"), "--task", "basic-import", "--model", "x", "--runs", "1"], install, { PATH: nodeOnlyPath() });
    expect(code).not.toBe(0);
    expect((stdout + stderr).toLowerCase()).toContain("bun");
    expect(stdout + stderr).not.toMatch(/\n\s+at .+:\d+:\d+/);
  });

  test("the library entry is importable from node", () => {
    writeFileSync(join(install, "probe.mjs"), 'import * as ax11y from "ax11y";\nconsole.log(JSON.stringify(Object.keys(ax11y).sort()));\n');
    const { code, stdout } = sh(["node", "probe.mjs"], install, { PATH: nodeOnlyPath() });
    expect(code).toBe(0);
    const names = JSON.parse(stdout);
    expect(names).toEqual(expect.arrayContaining(["check", "run", "summarize", "compare", "rules"]));
  });
});

describe("ax11y passes its own check", () => {
  test("level AAA, zero findings", () => {
    const { stdout } = sh(["bun", join(repo, "src", "cli.ts"), "check", repo, "--json"], repo);
    const report = JSON.parse(stdout);
    expect(report.findings).toEqual([]);
    expect(report.level).toBe("AAA");
  }, 60000);
});

describe("README is the product page", () => {
  const readme = () => readFileSync(join(repo, "README.md"), "utf8");
  test("defines agent readability and both layers", () => {
    const text = readme();
    expect(text).toMatch(/^# ax11y/m);
    expect(text.toLowerCase()).toContain("accessibility for coding agents");
    expect(text).toMatch(/## .*Definition/i);
    expect(text).toContain("ax11y check");
    expect(text).toContain("ax11y run");
    expect(text).toContain("ax11y compare");
  });
  test("lists every rule id with its level, and every level", () => {
    const text = readme();
    for (const [rule, level] of [["readme-present", "A"], ["entry-resolves", "A"], ["types-present", "A"], ["readme-imports-exist", "AA"], ["readme-examples-typecheck", "AA"], ["llms-txt", "AA"], ["exports-documented", "AAA"], ["errors-actionable", "AAA"]]) {
      expect(text).toMatch(new RegExp(`\\|\\s*\`${rule}\`\\s*\\|\\s*${level}\\s*\\|`));
    }
    expect(text).toMatch(/## .*Levels/i);
  });
  test("states the limits, including that every run score applies to one agent and model", () => {
    const text = readme().toLowerCase();
    expect(text).toMatch(/## .*limits/);
    expect(text).toContain("one agent and one model");
    expect(text).toContain("bun");
    expect(text).toContain("chrome-headless-shell");
    expect(text).toMatch(/no llm.as.judge|no model judges/);
  });
  test("shows a real example report with agent, model, task, runs and date", () => {
    const text = readme();
    expect(text).toMatch(/agent \S+, model \S+, task \S+, \d+ runs, \d{4}-\d{2}-\d{2}, ax11y \d+\.\d+\.\d+/);
  });
  test("has a CI badge pointing at the workflow", () => {
    expect(readme()).toContain("github.com/acoyfellow/ax11y/actions/workflows/ci.yml/badge.svg");
  });
});

describe("CI workflow", () => {
  test("runs typecheck, tests and the self-check on push and pull request", () => {
    const path = join(repo, ".github", "workflows", "ci.yml");
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toMatch(/on:[\s\S]*push[\s\S]*pull_request/);
    expect(text).toContain("oven-sh/setup-bun");
    expect(text).toContain("bun run typecheck");
    expect(text).toMatch(/bun test/);
    expect(text).toMatch(/check \. |check \.$|check \.\s/m);
    expect(text).toContain("playwright");
  });
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
