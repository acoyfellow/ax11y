import { isScriptBlock } from "../readme.js";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "readme-present",
  level: "A",
  run(context) {
    if (context.readmeText && context.blocks.some(isScriptBlock)) return [];
    return [{ rule: "readme-present", level: "A", severity: "error", file: "README.md", message: "Package README must include a fenced JavaScript or TypeScript example.", fix: "Add README.md with a fenced js, ts, jsx, or tsx usage example." }];
  },
};
