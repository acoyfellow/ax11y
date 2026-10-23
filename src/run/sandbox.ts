import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function createSandbox(targetDirectory: string, packageName: string, setupDirectory?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ax11y-run-"));
  mkdirSync(join(directory, "node_modules", dirname(packageName)), { recursive: true });
  cpSync(targetDirectory, join(directory, "node_modules", packageName), { recursive: true, dereference: true });
  if (setupDirectory) cpSync(setupDirectory, directory, { recursive: true, dereference: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "ax11y-sandbox", private: true, type: "module", dependencies: { [packageName]: "*" } }) + "\n");
  return directory;
}

export function packageDetails(directory: string): { name: string; version: string } {
  const packageJson = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { name?: string; version?: string };
  return { name: packageJson.name ?? "unknown", version: packageJson.version ?? "0.0.0" };
}
