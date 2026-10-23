import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "llms-txt",
  level: "AA",
  run(context) {
    const path = join(context.directory, "llms.txt");
    if (!existsSync(path)) return [{ rule: "llms-txt", level: "AA", severity: "error", file: "llms.txt", message: "Package does not include llms.txt.", fix: "Add llms.txt with an H1, a blockquote summary, and valid package-relative links." }];
    const text = readFileSync(path, "utf8");
    if (!context.readmePath) return [];
    const lines = text.split(/\r?\n/);
    if (!lines[0]?.startsWith("# ") || !lines.some((line) => line.startsWith("> "))) return [{ rule: "llms-txt", level: "AA", severity: "error", file: "llms.txt", message: "llms.txt must start with an H1 and include a > summary line.", fix: "Start llms.txt with '# Title' and include a '> concise summary' line." }];
    const link = /\]\((\.\/?[^)]+)\)/g;
    for (const match of text.matchAll(link)) {
      const destination = match[1]!;
      const target = resolve(context.directory, destination);
      if (relative(context.directory, target).startsWith("..") || !existsSync(target)) {
        const line = text.slice(0, match.index).split("\n").length;
        return [{ rule: "llms-txt", level: "AA", severity: "error", file: "llms.txt", line, message: `Relative link ${destination} does not resolve inside this package.`, fix: "Update the link to a file shipped within the package." }];
      }
    }
    return [];
  },
};
