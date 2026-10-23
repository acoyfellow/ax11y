import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parseReadmeBlocks } from "./readme.js";
import type { CheckContext } from "./types.js";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function firstPath(value: unknown, preferred: string[]): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of preferred) {
    const found = firstPath(record[key], preferred);
    if (found) return found;
  }
  for (const found of Object.values(record)) {
    if (!found || typeof found !== "object") continue;
    const path = firstPath(found, preferred);
    if (path) return path;
  }
  return undefined;
}

export function entryPaths(packageJson: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  for (const key of ["main", "module", "types", "typings"]) {
    if (typeof packageJson[key] === "string") paths.add(packageJson[key]);
  }
  const collect = (value: unknown): void => {
    if (typeof value === "string") paths.add(value);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(collect);
  };
  collect(packageJson.exports);
  return [...paths];
}

export function createContext(directory: string): CheckContext {
  const packageJson = readJson(join(directory, "package.json"));
  const readmeName = ["README.md", "readme.md", "README", "readme"].find((name) => existsSync(join(directory, name)));
  const readmePath = readmeName ? join(directory, readmeName) : undefined;
  const readmeText = readmePath ? readFileSync(readmePath, "utf8") : undefined;
  const runtime = firstPath(packageJson.exports, ["default", "import", "require", "node"])
    ?? (typeof packageJson.main === "string" ? packageJson.main : undefined)
    ?? (typeof packageJson.module === "string" ? packageJson.module : undefined);
  const typeEntry = firstPath(packageJson.exports, ["types", "typings"])
    ?? (typeof packageJson.types === "string" ? packageJson.types : undefined)
    ?? (typeof packageJson.typings === "string" ? packageJson.typings : undefined);
  const mainPath = runtime && existsSync(join(directory, runtime)) ? join(directory, runtime) : undefined;
  const typesPath = typeEntry && existsSync(join(directory, typeEntry)) ? join(directory, typeEntry) : undefined;
  return {
    directory,
    packageJson,
    packageName: typeof packageJson.name === "string" ? packageJson.name : basename(directory),
    readmePath,
    readmeText,
    blocks: readmeText ? parseReadmeBlocks(readmeText) : [],
    mainPath,
    mainRelativePath: mainPath ? relative(directory, mainPath) : undefined,
    typesPath,
  };
}
