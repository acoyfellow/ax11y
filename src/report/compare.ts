import type { RunResult } from "../run/index.js";
import { median, mannWhitney } from "./stats.js";

export type Comparison = { p: number; u: number; method: "exact" | "normal"; medianA: number; medianB: number; ratio: number; significant: boolean; direction: "none" | "a-worse" | "b-worse" };

function comparisonValues(result: RunResult): number[] {
  return result.runs.map((run) => run.pass ? run.tokens : Infinity);
}

export function compareResults(a: RunResult, b: RunResult): Comparison {
  for (const field of ["agent", "model", "task"] as const) {
    if (a[field] !== b[field]) throw new Error(`Cannot compare results with different ${field}`);
  }
  const valuesA = comparisonValues(a);
  const valuesB = comparisonValues(b);
  const test = mannWhitney(valuesA, valuesB);
  const medianA = a.runs.some((run) => !run.pass) ? Infinity : median(valuesA);
  const medianB = b.runs.some((run) => !run.pass) ? Infinity : median(valuesB);
  const difference = Math.abs(medianB - medianA);
  const ratio = difference === Infinity ? Infinity : difference / Math.min(medianA, medianB);
  const significant = test.p < 0.05 && ratio > 0.1;
  return { ...test, medianA, medianB, ratio, significant, direction: significant ? (medianA > medianB ? "a-worse" : "b-worse") : "none" };
}
