import { existsSync } from "node:fs";
import { join } from "node:path";
import { entryPaths } from "../context.js";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "entry-resolves",
  level: "A",
  run(context) {
    return entryPaths(context.packageJson).filter((entry) => !existsSync(join(context.directory, entry))).map((entry) => ({
      rule: "entry-resolves", level: "A", severity: "error" as const, file: "package.json", message: `Declared entry path ${entry} does not exist in this package.`, fix: `Ship ${entry} or update package.json to point at an existing entry.`,
    }));
  },
};
