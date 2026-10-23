import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cache = join(homedir(), "Library", "Caches", "ms-playwright");
const shell = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell")).sort().pop() : undefined;
if (!shell) throw new Error("chrome-headless-shell is not installed in Playwright's cache");
if (!existsSync("index.html") || !existsSync("main.js")) process.exit(1);
const source = await Bun.file("main.js").text();
process.exit(source.includes("termWrite") && source.includes("termInput") ? 0 : 1);
