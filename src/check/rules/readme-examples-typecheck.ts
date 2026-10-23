import { typecheckExamples } from "../typecheck.js";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "readme-examples-typecheck",
  level: "AA",
  run(context) {
    if (!context.readmeText || !context.typesPath) return [];
    return typecheckExamples(context).map((diagnostic) => ({
      rule: "readme-examples-typecheck", level: "AA" as const, severity: "error" as const, file: "README.md", line: diagnostic.line, message: `README example does not type-check: ${diagnostic.message}`, fix: "Correct the example so it type-checks against the package declarations.",
    }));
  },
};
