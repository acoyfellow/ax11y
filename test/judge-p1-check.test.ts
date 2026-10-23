import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const fixtures = join(repo, "fixtures");
const rules = ["readme-present", "entry-resolves", "types-present", "readme-imports-exist", "readme-examples-typecheck", "llms-txt", "exports-documented", "errors-actionable"];
const levels: Record<string, string> = {
  "readme-present": "A",
  "entry-resolves": "A",
  "types-present": "A",
  "readme-imports-exist": "AA",
  "readme-examples-typecheck": "AA",
  "llms-txt": "AA",
  "exports-documented": "AAA",
  "errors-actionable": "AAA",
};

type Finding = { rule: string; level: string; severity: string; file: string; line?: number; message: string; fix: string };
type Report = { target: string; package: { name: string; version: string }; findings: Finding[]; level: "none" | "A" | "AA" | "AAA"; rules: { id: string; level: string; status: "pass" | "fail" | "skip" }[] };

function cli(args: string[], cwd = repo): { code: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return { code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function check(dir: string, extra: string[] = []): { code: number; report: Report } {
  const { code, stdout, stderr } = cli(["check", dir, "--json", ...extra]);
  let report: Report;
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(`check --json did not print JSON (exit ${code}). stdout: ${stdout.slice(0, 400)} stderr: ${stderr.slice(0, 400)}`);
  }
  return { code, report };
}

test("fixtures are the driver's: clean plus exactly one planted fixture per rule", () => {
  const names = readdirSync(fixtures).sort();
  expect(names).toEqual(["clean", ...rules.map((rule) => `planted-${rule}`)].sort());
});

test("clean fixture: zero findings, level AAA, every rule pass, exit 0", () => {
  const { code, report } = check(join(fixtures, "clean"));
  expect(report.findings).toEqual([]);
  expect(report.level).toBe("AAA");
  expect(report.package).toEqual({ name: "greeter-fixture", version: "1.0.0" });
  expect(report.rules.map((rule) => rule.id).sort()).toEqual([...rules].sort());
  for (const rule of report.rules) {
    expect(rule.status).toBe("pass");
    expect(rule.level).toBe(levels[rule.id]!);
  }
  expect(code).toBe(0);
});

describe("each planted fixture is flagged by its own rule and no other", () => {
  for (const rule of rules) {
    test(rule, () => {
      const { code, report } = check(join(fixtures, `planted-${rule}`));
      const flagged = [...new Set(report.findings.map((finding) => finding.rule))];
      expect(flagged).toEqual([rule]);
      for (const finding of report.findings) {
        expect(finding.level).toBe(levels[rule]!);
        expect(finding.file.length).toBeGreaterThan(0);
        expect(finding.message.length).toBeGreaterThan(10);
        expect(finding.fix.length).toBeGreaterThan(10);
      }
      expect(report.rules.find((entry) => entry.id === rule)!.status).toBe("fail");
      expect(code).not.toBe(0);
    });
  }
});

test("levels: a failure caps the level below the failing rule's level", () => {
  expect(check(join(fixtures, "planted-readme-present")).report.level).toBe("none");
  expect(check(join(fixtures, "planted-llms-txt")).report.level).toBe("A");
  expect(check(join(fixtures, "planted-errors-actionable")).report.level).toBe("AA");
});

test("--fail-level controls the exit code", () => {
  expect(check(join(fixtures, "planted-errors-actionable"), ["--fail-level", "AA"]).code).toBe(0);
  expect(check(join(fixtures, "planted-errors-actionable"), ["--fail-level", "AAA"]).code).not.toBe(0);
  expect(check(join(fixtures, "planted-llms-txt"), ["--fail-level", "A"]).code).toBe(0);
  expect(check(join(fixtures, "planted-llms-txt"), ["--fail-level", "AA"]).code).not.toBe(0);
});

test("findings point at the right file and line", () => {
  const imports = check(join(fixtures, "planted-readme-imports-exist")).report.findings[0]!;
  expect(imports.file).toBe("README.md");
  expect(imports.line).toBe(8);
  expect(imports.message).toContain("welcome");
  const typecheck = check(join(fixtures, "planted-readme-examples-typecheck")).report.findings[0]!;
  expect(typecheck.file).toBe("README.md");
  expect(typecheck.line).toBe(10);
  const errors = check(join(fixtures, "planted-errors-actionable")).report.findings[0]!;
  expect(errors.file).toBe("index.js");
  expect(errors.line).toBe(2);
  expect(errors.message).toContain("bad input");
  const entry = check(join(fixtures, "planted-entry-resolves")).report.findings[0]!;
  expect(entry.file).toBe("package.json");
  expect(entry.message).toContain("./dist/index.js");
  const documented = check(join(fixtures, "planted-exports-documented")).report.findings[0]!;
  expect(documented.message).toContain("shout");
  const llms = check(join(fixtures, "planted-llms-txt")).report.findings[0]!;
  expect(llms.file).toBe("llms.txt");
  expect(llms.message).toContain("./docs/guide.md");
});

test("ax11y-skip marker skips a README block", () => {
  const dir = mkdtempSync(join(tmpdir(), "ax11y-skip-"));
  try {
    cpSync(join(fixtures, "planted-readme-examples-typecheck"), dir, { recursive: true });
    const readme = Bun.file(join(dir, "README.md"));
    const text = require("node:fs").readFileSync(join(dir, "README.md"), "utf8") as string;
    writeFileSync(join(dir, "README.md"), text.replace("```ts\n", "<!-- ax11y-skip -->\n```ts\n"));
    void readme;
    expect(check(dir).report.findings.filter((finding) => finding.rule === "readme-examples-typecheck")).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("human output names rule, file:line and fix", () => {
  const { stdout, code } = cli(["check", join(fixtures, "planted-readme-imports-exist")]);
  expect(code).not.toBe(0);
  expect(stdout).toContain("readme-imports-exist");
  expect(stdout).toContain("README.md:8");
  expect(stdout.toLowerCase()).toContain("fix");
});

test("checks an npm spec without running install scripts", () => {
  const { code, report } = check("cloudterm@0.0.14");
  expect(report.package.name).toBe("cloudterm");
  expect(report.package.version).toBe("0.0.14");
  expect(report.rules.length).toBe(rules.length);
  expect(["none", "A", "AA", "AAA"]).toContain(report.level);
  expect([0, 1]).toContain(code);
}, 120000);

test("missing target fails with a clear message, not a stack trace", () => {
  expect(require("node:fs").existsSync(join(repo, "src", "cli.ts"))).toBe(true);
  const { code, stdout, stderr } = cli(["check", join(repo, "does-not-exist-dir")]);
  expect(code).not.toBe(0);
  expect(stdout + stderr).toContain("does-not-exist-dir");
  expect((stdout + stderr).toLowerCase()).toMatch(/not found|no such|does not exist/);
  expect(stdout + stderr).not.toMatch(/\n\s+at .+:\d+:\d+/);
});

test("help lists commands", () => {
  const { code, stdout } = cli(["--help"]);
  expect(code).toBe(0);
  expect(stdout).toContain("check");
  expect(stdout).toContain("run");
});
