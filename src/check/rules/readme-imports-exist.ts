import ts from "typescript";
import { isScriptBlock } from "../readme.js";
import { declaredExports } from "../typecheck.js";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "readme-imports-exist",
  level: "AA",
  run(context) {
    if (!context.readmeText || !context.typesPath) return [];
    const exports = declaredExports(context);
    const findings = [];
    for (const block of context.blocks.filter(isScriptBlock)) {
      const source = ts.createSourceFile("README example", block.code, ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(source).slice(1, -1) !== context.packageName || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
        for (const item of statement.importClause.namedBindings.elements) {
          const name = item.propertyName?.text ?? item.name.text;
          if (exports.has(name)) continue;
          const position = source.getLineAndCharacterOfPosition(item.getStart(source));
          findings.push({ rule: "readme-imports-exist", level: "AA" as const, severity: "error" as const, file: "README.md", line: block.startLine + position.line, message: `README imports ${name}, but it is not exported by ${context.packageName}.`, fix: `Export ${name} in the declarations or remove it from the README example.` });
        }
      }
    }
    return findings;
  },
};
