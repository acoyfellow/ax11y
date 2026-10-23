import { readFileSync } from "node:fs";
import ts from "typescript";
import type { Rule } from "../types.js";

export const rule: Rule = {
  id: "exports-documented",
  level: "AAA",
  run(context) {
    if (!context.mainPath) return [];
    const text = readFileSync(context.mainPath, "utf8");
    const source = ts.createSourceFile(context.mainPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) names.add(statement.name.text);
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
    }
    const docs = `${context.readmeText ?? ""}\n${context.mainPath ? (() => { try { return readFileSync(`${context.directory}/llms.txt`, "utf8"); } catch { return ""; } })() : ""}`;
    return [...names].filter((name) => !docs.includes(name)).map((name) => ({ rule: "exports-documented", level: "AAA" as const, severity: "error" as const, file: context.mainRelativePath ?? "package.json", message: `Runtime export ${name} is not documented in README.md or llms.txt.`, fix: `Document the ${name} export in README.md or llms.txt.` }));
  },
};
