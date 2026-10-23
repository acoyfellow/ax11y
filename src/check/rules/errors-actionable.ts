import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Finding, Rule } from "../types.js";

function errorMessage(node: ts.NewExpression): string | undefined {
  if (!ts.isIdentifier(node.expression) || !node.expression.text.endsWith("Error")) return undefined;
  const argument = node.arguments?.[0];
  if (!argument) return undefined;
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text;
  return undefined;
}

export const rule: Rule = {
  id: "errors-actionable",
  level: "AAA",
  run(context) {
    if (!context.mainPath) return [];
    const text = readFileSync(context.mainPath, "utf8");
    const source = ts.createSourceFile(context.mainPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const findings: Finding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node)) {
        const message = errorMessage(node);
        if (message && (message.length < 20 || /^[A-Za-z_$][\w$]*\s*\([^)]*\)$/.test(message))) {
          findings.push({ rule: "errors-actionable", level: "AAA", severity: "error", file: context.mainRelativePath ?? "package.json", line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, message: `Error message '${message}' is not actionable enough.`, fix: "Use an Error message of at least 20 characters that explains the problem and correction." });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return findings;
  },
};
