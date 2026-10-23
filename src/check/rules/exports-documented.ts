import { readFileSync } from "node:fs";
import { moduleExports } from "../typecheck.js";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "exports-documented",
  level: "AAA",
  run(context) {
    if (!context.mainPath) return [];
    const names = moduleExports(context.mainPath, { allowJs: true, resolveDefault: true });
    const docs = `${context.readmeText ?? ""}\n${(() => { try { return readFileSync(`${context.directory}/llms.txt`, "utf8"); } catch { return ""; } })()}`;
    return [...names].filter((name) => !docs.includes(name)).map((name) => ({ rule: "exports-documented", level: "AAA" as const, severity: "error" as const, file: context.mainRelativePath ?? "package.json", message: `Runtime export ${name} is not documented in README.md or llms.txt.`, fix: `Document the ${name} export in README.md or llms.txt.` }));
  },
};
