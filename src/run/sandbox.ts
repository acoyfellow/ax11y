import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function installTargetDependencies(directory: string, packageName: string): void {
  const result = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--omit=dev"], { cwd: directory, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Unable to install dependencies for ${packageName}: ${result.stderr || result.error?.message || "npm install failed"}`);
  rmSync(join(directory, "package-lock.json"), { force: true });
  rmSync(join(directory, "node_modules", ".package-lock.json"), { force: true });
}

export function createSandbox(targetDirectory: string, packageName: string, setupDirectory?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ax11y-run-"));
  const target = join(directory, ".ax11y-target");
  cpSync(targetDirectory, target, { recursive: true, dereference: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "ax11y-sandbox", private: true, type: "module", dependencies: { [packageName]: "file:./.ax11y-target" } }) + "\n");
  installTargetDependencies(directory, packageName);
  if (setupDirectory) cpSync(setupDirectory, directory, { recursive: true, dereference: true });
  return directory;
}

export function packageDetails(directory: string): { name: string; version: string } {
  const packageJson = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { name?: string; version?: string };
  return { name: packageJson.name ?? "unknown", version: packageJson.version ?? "0.0.0" };
}
