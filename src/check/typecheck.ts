import ts from "typescript";
import { relative } from "node:path";
import { isScriptBlock } from "./readme.js";
import type { CheckContext, ReadmeBlock } from "./types.js";

const missingExportCodes = new Set([2305, 2614, 2724]);

function programFor(context: CheckContext, block: ReadmeBlock): ts.Program {
  const sourcePath = "/ax11y-readme-example.ts";
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: [],
    baseUrl: context.directory,
    paths: context.typesPath ? { [context.packageName]: [relative(context.directory, context.typesPath)] } : undefined,
  };
  const host = ts.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === sourcePath || originalFileExists(name);
  host.readFile = (name) => name === sourcePath ? block.code : originalReadFile(name);
  host.getSourceFile = (name, languageVersion) => name === sourcePath
    ? ts.createSourceFile(name, block.code, languageVersion, true)
    : originalGetSourceFile(name, languageVersion);
  return ts.createProgram([sourcePath], options, host);
}

export function typecheckExamples(context: CheckContext): Array<{ line: number; message: string; code: number }> {
  if (!context.typesPath) return [];
  const results: Array<{ line: number; message: string; code: number }> = [];
  for (const block of context.blocks.filter((item) => isScriptBlock(item) && !item.skipped)) {
    for (const diagnostic of ts.getPreEmitDiagnostics(programFor(context, block))) {
      if (diagnostic.code === 2307 || missingExportCodes.has(diagnostic.code)) continue;
      const offset = diagnostic.start ?? 0;
      const line = block.startLine + block.code.slice(0, offset).split("\n").length - 1;
      results.push({ line, code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") });
    }
  }
  return results;
}

export function moduleExports(entryPath: string, options: { allowJs?: boolean; resolveDefault?: boolean } = {}): Set<string> {
  const program = ts.createProgram([entryPath], {
    allowJs: options.allowJs,
    checkJs: false,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    noLib: true,
    target: ts.ScriptTarget.ES2022,
  });
  const source = program.getSourceFile(entryPath);
  if (!source) return new Set();
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (!module) return new Set();
  return new Set(checker.getExportsOfModule(module).map((symbol) => {
    if (!options.resolveDefault || symbol.getName() !== "default") return symbol.getName();
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const name = target.valueDeclaration && ts.getNameOfDeclaration(target.valueDeclaration);
    return name && ts.isIdentifier(name) ? name.text : target.getName();
  }));
}

export function declaredExports(context: CheckContext): Set<string> {
  return context.typesPath ? moduleExports(context.typesPath) : new Set();
}
