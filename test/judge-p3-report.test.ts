import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p3-"));
const stats = await import(join(repo, "src", "report", "stats.ts"));

describe("median and quartiles match numpy (linear interpolation, type 7)", () => {
  const cases: [number[], number, number, number][] = [
    [[1, 2, 3, 4, 5], 3, 2, 4],
    [[1, 2, 3, 4], 2.5, 1.75, 3.25],
    [[10, 20, 30, 40, 50, 60, 70], 40, 25, 55],
    [[3, 1, 2], 2, 1.5, 2.5],
  ];
  for (const [values, median, q1, q3] of cases) {
    test(JSON.stringify(values), () => {
      expect(stats.median(values)).toBeCloseTo(median, 9);
      expect(stats.quantile(values, 0.25)).toBeCloseTo(q1, 9);
      expect(stats.quantile(values, 0.75)).toBeCloseTo(q3, 9);
      expect(stats.iqr(values)).toBeCloseTo(q3 - q1, 9);
    });
  }
  test("does not mutate its input", () => {
    const values = [3, 1, 2];
    stats.median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("Wilson 95% interval matches the closed form (z = 1.959963984540054)", () => {
  const cases: [number, number, number, number][] = [
    [0, 5, 0, 0.434482],
    [5, 5, 0.565518, 1],
    [3, 5, 0.230724, 0.882379],
    [7, 10, 0.396778, 0.892209],
    [1, 20, 0.008881, 0.236131],
  ];
  for (const [k, n, low, high] of cases) {
    test(`${k}/${n}`, () => {
      const interval = stats.wilson(k, n);
      expect(interval.low).toBeCloseTo(low, 5);
      expect(interval.high).toBeCloseTo(high, 5);
    });
  }
});

describe("Mann-Whitney U, two-sided, exact permutation over midranks (ties handled) when n1 + n2 <= 40", () => {
  const cases: [number[], number[], number, number][] = [
    [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], 0, 0.007937],
    [[10, 20, 30, 40, 50], [12, 22, 28, 41, 55], 11, 0.84127],
    [[1, 2, 3], [1, 2, 3], 4.5, 1],
    [[5, 6, 7, 8, 9], [1, 2, 3, 4, 5], 24.5, 0.015873],
    [[1, 1, 2, 2, 3], [2, 3, 3, 4, 4], 3, 0.079365],
    [[1, 2, 3, 4, 5], [3, 4, 5, Infinity, Infinity], 4.5, 0.134921],
    [[100, 200, 300, 400, 500, 600], [150, 250, 350, 450, 550, 650, 750], 15, 0.445221],
    [[7, 7, 7, 7, 7], [7, 7, 7, 7, 7], 12.5, 1],
  ];
  for (const [a, b, u, p] of cases) {
    test(`${JSON.stringify(a)} vs ${JSON.stringify(b)}`, () => {
      const result = stats.mannWhitney(a, b);
      expect(result.u).toBeCloseTo(u, 9);
      expect(result.p).toBeCloseTo(p, 5);
      expect(result.method).toBe("exact");
    });
  }
  test("large samples use the normal approximation with tie and continuity correction", () => {
    const a = Array.from({ length: 25 }, (_, index) => index + 1);
    const b = a.map((value) => value + 3);
    const result = stats.mannWhitney(a, b);
    expect(result.u).toBeCloseTo(242, 9);
    expect(result.p).toBeCloseTo(0.174173, 4);
    expect(result.method).toBe("normal");
  });
  test("exact path is fast enough for 20 vs 20", () => {
    const a = Array.from({ length: 20 }, (_, index) => index * 1.5);
    const b = Array.from({ length: 20 }, (_, index) => index * 1.5 + 4);
    const started = performance.now();
    const result = stats.mannWhitney(a, b);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(result.method).toBe("exact");
    expect(result.p).toBeGreaterThan(0);
    expect(result.p).toBeLessThanOrEqual(1);
  });
});

type Run = { index: number; pass: boolean; tokens: number; costUsd: number; toolCalls: number; turns: number; wallMs: number; timedOut: boolean; inventedImports: string[]; sandbox: string; transcript: string };

function result(name: string, runs: Array<[boolean, number, number]>, overrides: Record<string, unknown> = {}): string {
  const path = join(scratch, `${name}-${Math.random().toString(36).slice(2, 8)}.json`);
  const entries: Run[] = runs.map(([pass, tokens, turns], index) => ({ index, pass, tokens, costUsd: tokens / 1e6, toolCalls: turns, turns, wallMs: 1000, timedOut: false, inventedImports: pass ? [] : ["welcome"], sandbox: "/tmp/x", transcript: "/tmp/x/t" }));
  writeFileSync(path, JSON.stringify({ ax11yVersion: "0.1.0", agent: "pi", model: "gpt-test", task: "render-hello", target: { name, version: "1.0.0" }, date: "2026-10-24T00:00:00.000Z", runs: entries, ...overrides }));
  return path;
}

function cli(args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  return { code: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

test("summary of one result: medians, IQR, pass rate with Wilson interval, invented import count", () => {
  const file = result("pkg", [[true, 100, 4], [true, 200, 5], [true, 300, 6], [false, 900, 9], [true, 250, 5]]);
  const { code, stdout } = cli(["report", file, "--json"]);
  expect(code).toBe(0);
  const summary = JSON.parse(stdout);
  expect(summary.runs).toBe(5);
  expect(summary.passes).toBe(4);
  expect(summary.passRate).toBeCloseTo(0.8, 9);
  expect(summary.passRateInterval.low).toBeCloseTo(0.375535, 4);
  expect(summary.passRateInterval.high).toBeCloseTo(0.963776, 4);
  expect(summary.tokens.median).toBeCloseTo(250, 9);
  expect(summary.tokens.q1).toBeCloseTo(200, 9);
  expect(summary.tokens.q3).toBeCloseTo(300, 9);
  expect(summary.tokensToPass.median).toBeCloseTo(225, 9);
  expect(summary.turns.median).toBeCloseTo(5, 9);
  expect(summary.runsWithInventedImports).toBe(1);
  expect(summary.agent).toBe("pi");
  expect(summary.model).toBe("gpt-test");
});

describe("compare: failed runs count as +Infinity tokens; significant means p < 0.05 AND median difference > 10%", () => {
  test("clearly worse B is significant", () => {
    const a = result("a", [[true, 100, 3], [true, 110, 3], [true, 120, 3], [true, 130, 3], [true, 140, 3]]);
    const b = result("b", [[true, 300, 6], [true, 310, 6], [false, 999, 9], [true, 330, 6], [false, 999, 9]]);
    const { stdout, code } = cli(["compare", a, b, "--json"]);
    const comparison = JSON.parse(stdout);
    expect(comparison.significant).toBe(true);
    expect(comparison.direction).toBe("b-worse");
    expect(comparison.p).toBeCloseTo(0.007937, 5);
    expect(comparison.medianA).toBeCloseTo(120, 9);
    expect(comparison.medianB).toBe("Infinity");
    expect(code).toBe(0);
  });
  test("identical-looking runs are not significant", () => {
    const a = result("a", [[true, 100, 3], [true, 200, 3], [true, 300, 3], [true, 400, 3], [true, 500, 3]]);
    const b = result("b", [[true, 120, 3], [true, 220, 3], [true, 280, 3], [true, 410, 3], [true, 550, 3]]);
    const comparison = JSON.parse(cli(["compare", a, b, "--json"]).stdout);
    expect(comparison.significant).toBe(false);
    expect(comparison.direction).toBe("none");
    expect(comparison.p).toBeCloseTo(0.84127, 4);
  });
  test("a significant p with a small median difference is not significant", () => {
    const a = result("a", [[true, 1000, 3], [true, 1001, 3], [true, 1002, 3], [true, 1003, 3], [true, 1004, 3]]);
    const b = result("b", [[true, 1010, 3], [true, 1011, 3], [true, 1012, 3], [true, 1013, 3], [true, 1014, 3]]);
    const comparison = JSON.parse(cli(["compare", a, b, "--json"]).stdout);
    expect(comparison.p).toBeLessThan(0.05);
    expect(comparison.significant).toBe(false);
  });
  test("results from different models, agents or tasks refuse to compare", () => {
    const a = result("a", [[true, 100, 3], [true, 100, 3]]);
    const b = result("b", [[true, 100, 3], [true, 100, 3]], { model: "other-model" });
    const { code, stdout, stderr } = cli(["compare", a, b]);
    expect(code).not.toBe(0);
    expect((stdout + stderr).toLowerCase()).toContain("model");
  });
});

test("markdown report states agent, model, task, runs, date and ax11y version", () => {
  const file = result("pkg", [[true, 100, 4], [true, 200, 5], [false, 900, 9]]);
  const { stdout, code } = cli(["report", file, "--format", "markdown"]);
  expect(code).toBe(0);
  for (const text of ["pi", "gpt-test", "render-hello", "3 runs", "2026-10-24", "ax11y 0.1.0", "pkg@1.0.0"]) expect(stdout).toContain(text);
  expect(stdout).toMatch(/\|.*\|/);
});

test("run --compare runs both targets with the same settings and prints the comparison", () => {
  const fixture = join(repo, "fixtures", "clean");
  const proc = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "run", fixture, "--compare", fixture, "--task", join(import.meta.dir, "tasks", "greet"), "--agent", "command", "--agent-command", `bun ${join(import.meta.dir, "fake-agents", "good.ts")}`, "--model", "fake-model-1", "--runs", "3", "--json"], { stdout: "pipe", stderr: "pipe" });
  const output = JSON.parse(proc.stdout.toString());
  expect(output.a.runs.length).toBe(3);
  expect(output.b.runs.length).toBe(3);
  expect(output.comparison.significant).toBe(false);
  expect(output.comparison.p).toBeCloseTo(1, 9);
}, 180000);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
