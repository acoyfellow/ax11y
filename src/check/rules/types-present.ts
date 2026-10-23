import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "types-present",
  level: "A",
  run(context) {
    if (context.typesPath) return [];
    return [{ rule: "types-present", level: "A", severity: "error", file: "package.json", message: "Package main entry does not ship TypeScript declarations.", fix: "Add a types declaration entry or ship a .d.ts file alongside the main entry." }];
  },
};
