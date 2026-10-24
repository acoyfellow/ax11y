export type MannWhitneyResult = { u: number; p: number; method: "exact" | "normal" };

function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  if (q < 0 || q > 1) throw new RangeError("Quantile must be between zero and one");
  const ordered = sorted(values);
  const position = (ordered.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return ordered[lower]! + (ordered[upper]! - ordered[lower]!) * (position - lower);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function iqr(values: readonly number[]): number {
  return quantile(values, 0.75) - quantile(values, 0.25);
}

export function wilson(k: number, n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 };
  const z = 1.959963984540054;
  const zSquared = z * z;
  const proportion = k / n;
  const center = (proportion + zSquared / (2 * n)) / (1 + zSquared / n);
  const radius = z * Math.sqrt((proportion * (1 - proportion) + zSquared / (4 * n)) / n) / (1 + zSquared / n);
  return { low: Math.max(0, center - radius), high: Math.min(1, center + radius) };
}

function ranks(values: readonly number[]): { ranks: number[]; tieSizes: number[] } {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const assigned = Array<number>(values.length);
  const tieSizes: number[] = [];
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end]!.value === ordered[start]!.value) end++;
    const doubledRank = start + 1 + end;
    for (let index = start; index < end; index++) assigned[ordered[index]!.index] = doubledRank;
    tieSizes.push(end - start);
    start = end;
  }
  return { ranks: assigned, tieSizes };
}

function exactP(doubledRanks: readonly number[], selected: number, observedDoubledU: number): number {
  const maximumSum = doubledRanks.reduce((total, rank) => total + rank, 0);
  const counts = Array.from({ length: selected + 1 }, () => new Float64Array(maximumSum + 1));
  counts[0]![0] = 1;
  let seen = 0;
  for (const rank of doubledRanks) {
    seen++;
    for (let count = Math.min(selected, seen); count >= 1; count--) {
      const current = counts[count]!;
      const previous = counts[count - 1]!;
      for (let sum = rank; sum <= maximumSum; sum++) current[sum] += previous[sum - rank]!;
    }
  }
  const centerDoubledU = selected * (doubledRanks.length - selected);
  const distance = Math.abs(observedDoubledU - centerDoubledU);
  let extreme = 0;
  let total = 0;
  for (let sum = 0; sum <= maximumSum; sum++) {
    const count = counts[selected]![sum]!;
    if (count === 0) continue;
    total += count;
    const doubledU = sum - selected * (selected + 1);
    if (Math.abs(doubledU - centerDoubledU) + 1e-9 >= distance) extreme += count;
  }
  return extreme / total;
}

function normalTail(z: number): number {
  const t = 1 / (1 + 0.2316419 * z);
  const density = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  return density * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
}

export function mannWhitney(a: readonly number[], b: readonly number[]): MannWhitneyResult {
  if (a.length === 0 || b.length === 0) throw new RangeError("Mann-Whitney requires two non-empty samples");
  const combined = [...a, ...b];
  const ranked = ranks(combined);
  const n1 = a.length;
  const n2 = b.length;
  const doubledRankSum = ranked.ranks.slice(0, n1).reduce((total, rank) => total + rank, 0);
  const doubledU = doubledRankSum - n1 * (n1 + 1);
  const u = doubledU / 2;
  if (combined.length <= 40) return { u, p: exactP(ranked.ranks, n1, doubledU), method: "exact" };
  const tieCorrection = ranked.tieSizes.reduce((total, size) => total + size ** 3 - size, 0);
  const variance = n1 * n2 / 12 * ((combined.length + 1) - tieCorrection / (combined.length * (combined.length - 1)));
  const distance = Math.max(0, Math.abs(u - n1 * n2 / 2) - 0.5);
  const z = variance === 0 ? 0 : distance / Math.sqrt(variance);
  return { u, p: Math.min(1, 2 * normalTail(z)), method: "normal" };
}
