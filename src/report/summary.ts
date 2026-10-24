import type { RunResult } from "../run/index.js";
import { median, quantile, wilson } from "./stats.js";

export type ReportSummary = {
  runs: number;
  passes: number;
  passRate: number;
  passRateInterval: { low: number; high: number };
  tokens: { median: number; q1: number; q3: number };
  tokensToPass: { median: number };
  turns: { median: number };
  costUsd: { median: number };
  runsWithInventedImports: number;
  agent: string;
  model: string;
  task: string;
  target: { name: string; version: string };
  date: string;
  ax11yVersion: string;
};

export function summarizeResult(result: RunResult): ReportSummary {
  const passes = result.runs.filter((run) => run.pass);
  const tokens = result.runs.map((run) => run.tokens);
  return {
    runs: result.runs.length,
    passes: passes.length,
    passRate: result.runs.length === 0 ? 0 : passes.length / result.runs.length,
    passRateInterval: wilson(passes.length, result.runs.length),
    tokens: { median: median(tokens), q1: quantile(tokens, 0.25), q3: quantile(tokens, 0.75) },
    tokensToPass: { median: median(passes.map((run) => run.tokens)) },
    turns: { median: median(result.runs.map((run) => run.turns)) },
    costUsd: { median: median(result.runs.map((run) => run.costUsd)) },
    runsWithInventedImports: result.runs.filter((run) => run.inventedImports.length > 0).length,
    agent: result.agent,
    model: result.model,
    task: result.task,
    target: result.target,
    date: result.date,
    ax11yVersion: result.ax11yVersion,
  };
}
