import ts from "typescript";
import { relative } from "node:path";
import { isScriptBlock } from "./readme.js";
import type { CheckContext, ReadmeBlock } from "./types.js";

const missingExportCodes = new Set([2305, 2614, 2724]);
const programs = new WeakMap<CheckContext, { program: ts.Program; blockPaths: Map<ReadmeBlock, string> }>();

function programFor(context: CheckContext): { program: ts.Program; blockPaths: Map<ReadmeBlock, string> } {
  const cached = programs.get(context);
  if (cached) return cached;
  const blocks = context.blocks.filter((block) => isScriptBlock(block) && !block.skipped);
  const blockPaths = new Map(blocks.map((block, index) => [block, `/ax11y-readme-example-${index}.ts`]));
  const virtualFiles = new Map([...blockPaths].map(([block, path]) => [path, `${block.code}\nexport {};`]));
  const options: ts.CompilerOptions = {
    strict: true,
    allowJs: true,
    checkJs: false,
    noEmit: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    types: [],
    baseUrl: context.directory,
    paths: context.typesPath ? { [context.packageName]: [relative(context.directory, context.typesPath)] } : undefined,
  };
  const host = ts.createCompilerHost(options, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  host.fileExists = (name) => virtualFiles.has(name) || originalFileExists(name);
  host.readFile = (name) => virtualFiles.get(name) ?? originalReadFile(name);
  host.getSourceFile = (name, languageVersion) => {
    const text = virtualFiles.get(name);
    return text === undefined ? originalGetSourceFile(name, languageVersion) : ts.createSourceFile(name, text, languageVersion, true);
  };
  const roots = [...virtualFiles.keys(), context.typesPath, context.mainPath].filter((path): path is string => Boolean(path));
  const value = { program: ts.createProgram(roots, options, host), blockPaths };
  programs.set(context, value);
  return value;
}

export function typecheckExamples(context: CheckContext): Array<{ line: number; message: string; code: number }> {
  if (!context.typesPath) return [];
  const { program, blockPaths } = programFor(context);
  const results: Array<{ line: number; message: string; code: number }> = [];
  for (const [block, path] of blockPaths) {
    const source = program.getSourceFile(path);
    if (!source) continue;
    for (const diagnostic of ts.getPreEmitDiagnostics(program, source)) {
      if (diagnostic.code === 2307 || missingExportCodes.has(diagnostic.code)) continue;
      const offset = diagnostic.start ?? 0;
      const line = block.startLine + block.code.slice(0, offset).split("\n").length - 1;
      results.push({ line, code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") });
    }
  }
  return results;
}

export function moduleExports(context: CheckContext, entryPath: string, resolveDefault = false): Set<string> {
  const { program } = programFor(context);
  const source = program.getSourceFile(entryPath);
  if (!source) return new Set();
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (!module) return new Set();
  return new Set(checker.getExportsOfModule(module).map((symbol) => {
    if (!resolveDefault || symbol.getName() !== "default") return symbol.getName();
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const name = target.valueDeclaration && ts.getNameOfDeclaration(target.valueDeclaration);
    return name && ts.isIdentifier(name) ? name.text : target.getName();
  }));
}

export function declaredExports(context: CheckContext): Set<string> {
  return context.typesPath ? moduleExports(context, context.typesPath) : new Set();
}
