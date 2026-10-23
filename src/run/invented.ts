import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { createContext } from "../check/context.js";
import { declaredExports } from "../check/typecheck.js";

const extensions = new Set([".js", ".mjs", ".ts", ".tsx", ".jsx"]);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === "node_modules") return [];
    if (entry.isDirectory()) return files(path);
    return extensions.has(path.slice(path.lastIndexOf("."))) && statSync(path).isFile() ? [path] : [];
  });
}

export function inventedImports(sandbox: string, targetDirectory: string): string[] {
  const context = createContext(targetDirectory);
  const exports = declaredExports(context);
  const invented = new Set<string>();
  for (const path of files(sandbox)) {
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(source).slice(1, -1) !== context.packageName) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const item of bindings.elements) {
        const name = item.propertyName?.text ?? item.name.text;
        if (!exports.has(name)) invented.add(name);
      }
    }
  }
  return [...invented].sort();
}
