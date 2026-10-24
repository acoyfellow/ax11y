import { expect, test } from "bun:test";
import { mannWhitney } from "../src/report/stats.js";

function combinations(size: number, selected: number): number[][] {
  const output: number[][] = [];
  const visit = (start: number, choice: number[]): void => {
    if (choice.length === selected) {
      output.push(choice);
      return;
    }
    for (let index = start; index <= size - (selected - choice.length); index++) visit(index + 1, [...choice, index]);
  };
  visit(0, []);
  return output;
}

function bruteP(a: number[], b: number[]): number {
  const values = [...a, ...b];
  const ranks = values.map((value, index) => 1 + values.filter((other) => other < value).length + (values.filter((other) => other === value).length - 1) / 2);
  const u = ranks.slice(0, a.length).reduce((total, rank) => total + rank, 0) - a.length * (a.length + 1) / 2;
  const distance = Math.abs(u - a.length * b.length / 2);
  const extreme = combinations(values.length, a.length).filter((choice) => Math.abs(choice.reduce((total, index) => total + ranks[index]!, 0) - a.length * (a.length + 1) / 2 - a.length * b.length / 2) + 1e-9 >= distance);
  return extreme.length / combinations(values.length, a.length).length;
}

test("exact Mann-Whitney DP matches brute-force combinations", () => {
  let state = 2463534242;
  for (let iteration = 0; iteration < 25; iteration++) {
    const next = (): number => (state = (state * 1664525 + 1013904223) >>> 0);
    const a = Array.from({ length: 3 }, () => next() % 4);
    const b = Array.from({ length: 4 }, () => next() % 4);
    expect(mannWhitney(a, b).p).toBeCloseTo(bruteP(a, b), 12);
  }
});
