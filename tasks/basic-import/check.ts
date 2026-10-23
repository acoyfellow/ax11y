import { existsSync, readFileSync } from "node:fs";

if (!existsSync("solution.mjs")) process.exit(1);
const source = readFileSync("solution.mjs", "utf8");
const packageName = Object.keys(JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {})[0];
if (!packageName || !source.includes(`from "${packageName}"`) && !source.includes(`from '${packageName}'`)) process.exit(1);
const result = Bun.spawnSync(["node", "solution.mjs"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
process.exit(result.exitCode === 0 && result.stdout.toString().split(/\r?\n/).some((line) => line.startsWith("AX11Y-OK")) ? 0 : 1);
