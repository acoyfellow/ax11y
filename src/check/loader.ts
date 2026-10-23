import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type LoadedTarget = { directory: string; cleanup(): void };

export function loadTarget(target: string): LoadedTarget {
  if (existsSync(target)) {
    const directory = target;
    return { directory, cleanup() {} };
  }
  const temporary = mkdtempSync(join(tmpdir(), "ax11y-pack-"));
  try {
    execFileSync("npm", ["pack", target, "--pack-destination", temporary], { stdio: "pipe" });
    const archive = readdirSync(temporary).find((name) => name.endsWith(".tgz"));
    if (!archive) throw new Error(`npm pack produced no tarball for ${target}`);
    execFileSync("tar", ["-xzf", join(temporary, archive), "-C", temporary], { stdio: "pipe" });
    const directory = join(temporary, "package");
    if (!existsSync(join(directory, "package.json"))) throw new Error(`Packed target ${target} did not contain package.json`);
    return { directory, cleanup() { rmSync(temporary, { recursive: true, force: true }); } };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
