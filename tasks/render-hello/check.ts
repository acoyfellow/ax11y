import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = process.cwd();
const marker = "AX11Y-HELLO";
const packageRoot = join(root, "node_modules");

type CdpMessage = { id?: number; result?: Record<string, unknown>; error?: { message?: string }; method?: string; params?: { exceptionDetails?: { text?: string; exception?: { description?: string; value?: string } } } };

function failure(message: string): never {
  throw new Error(message);
}

function inside(path: string, directory: string): boolean {
  const pathRelative = relative(directory, path);
  return pathRelative === "" || (!pathRelative.startsWith(`..${sep}`) && pathRelative !== "..");
}

function packageParts(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const remainder = specifier.slice(name.length);
  return { name, subpath: remainder.startsWith("/") ? remainder.slice(1) : remainder };
}

function exportPath(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const condition of ["browser", "import", "module", "default"]) {
    const found = exportPath(record[condition]);
    if (found) return found;
  }
  return undefined;
}

function packageDirectory(name: string, sourcePath: string): string | undefined {
  let directory = dirname(sourcePath);
  while (inside(directory, root)) {
    const candidate = join(directory, "node_modules", name);
    if (existsSync(candidate)) return candidate;
    if (directory === root) break;
    directory = dirname(directory);
  }
  return undefined;
}

function resolvePackage(specifier: string, sourcePath: string): string | undefined {
  const { name, subpath } = packageParts(specifier);
  const directory = packageDirectory(name, sourcePath);
  if (!directory) return undefined;
  if (subpath) {
    const candidate = resolve(directory, subpath);
    if (inside(candidate, directory) && existsSync(candidate)) return candidate;
    for (const extension of [".js", ".mjs", ".css"]) if (existsSync(`${candidate}${extension}`)) return `${candidate}${extension}`;
    return undefined;
  }
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as Record<string, unknown>;
  const entry = exportPath(manifest.exports) ?? (typeof manifest.module === "string" ? manifest.module : undefined) ?? (typeof manifest.main === "string" ? manifest.main : undefined);
  if (!entry) return undefined;
  const candidate = resolve(directory, entry);
  return inside(candidate, directory) && existsSync(candidate) ? candidate : undefined;
}

function moduleUrl(path: string): string {
  return inside(path, packageRoot) ? `/node_modules/${relative(packageRoot, path).split(sep).join("/")}` : `/__external${path}`;
}

function rewriteImports(source: string, sourcePath: string): string {
  return source.replace(/(\bfrom\s*|\bimport\s*)(["'])([^"']+)\2/g, (whole, prefix: string, quote: string, specifier: string) => {
    if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("http:")) return whole;
    const entry = resolvePackage(specifier, sourcePath);
    return entry ? `${prefix}${quote}${moduleUrl(entry)}${quote}` : whole;
  });
}

function cssModule(css: string): string {
  return `const style=document.createElement("style");style.textContent=${JSON.stringify(css)};document.head.append(style);export default style;`;
}

function mime(path: string): string {
  return extname(path) === ".html" ? "text/html" : "application/javascript";
}

function startServer(): { port: number; stop: () => void } {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const requested = pathname.startsWith("/__external/") ? pathname.slice("/__external".length) : pathname === "/" ? join(root, "index.html") : resolve(root, `.${pathname}`);
      if ((!pathname.startsWith("/__external/") && !inside(requested, root)) || !existsSync(requested)) return new Response("not found", { status: 404 });
      if (extname(requested) === ".css") return new Response(cssModule(readFileSync(requested, "utf8")), { headers: { "content-type": "application/javascript" } });
      const source = readFileSync(requested, "utf8");
      return new Response(extname(requested) === ".js" || extname(requested) === ".mjs" ? rewriteImports(source, requested) : source, { headers: { "content-type": mime(requested) } });
    },
  });
  return { port: server.port!, stop: () => server.stop(true) };
}

async function freePort(): Promise<number> {
  return await new Promise((done, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("could not allocate port"));
      server.close((error) => error ? reject(error) : done(address.port));
    });
  });
}

function chromePath(): string | undefined {
  if (process.env.AX11Y_CHROME && existsSync(process.env.AX11Y_CHROME)) return process.env.AX11Y_CHROME;
  for (const cache of [join(homedir(), "Library", "Caches", "ms-playwright"), join(homedir(), ".cache", "ms-playwright")]) {
    if (!existsSync(cache)) continue;
    const shell = readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell")).sort().pop();
    if (!shell) continue;
    const found = readdirSync(join(cache, shell), { recursive: true }).find((name) => name.endsWith("/chrome-headless-shell") || name === "chrome-headless-shell");
    if (found) return join(cache, shell, found);
  }
  return undefined;
}

async function eventually<T>(action: () => Promise<T>, predicate: (value: T) => boolean, timeout: number): Promise<T | undefined> {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await action();
    if (predicate(value)) return value;
    await Bun.sleep(50);
  }
  return undefined;
}

async function main(): Promise<void> {
  if (!existsSync(join(root, "index.html")) || !existsSync(join(root, "main.js"))) failure("missing index.html or main.js");
  const binary = chromePath();
  if (!binary) failure("chrome-headless-shell is not installed in Playwright's cache");
  const server = startServer();
  const debugPort = await freePort();
  const linuxFlags = process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] : [];
  const chrome = Bun.spawn([binary, `--remote-debugging-port=${debugPort}`, "--no-first-run", ...linuxFlags, "about:blank"], { stdout: "ignore", stderr: "pipe" });
  const chromeErrors = new Response(chrome.stderr).text();
  let socket: WebSocket | undefined;
  const pageErrors: string[] = [];
  try {
    const endpoint = await eventually(async () => {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json() as Array<{ type: string; webSocketDebuggerUrl?: string }>;
        return targets.find((target) => target.type === "page")?.webSocketDebuggerUrl;
      } catch { return undefined; }
    }, Boolean, 30_000);
    if (!endpoint) {
      chrome.kill(9);
      failure(`chrome did not start: ${(await chromeErrors).trim().split("\n").slice(-3).join(" | ").slice(0, 400)}`);
    }
    socket = new WebSocket(endpoint);
    await new Promise<void>((done, reject) => { socket!.addEventListener("open", () => done(), { once: true }); socket!.addEventListener("error", () => reject(new Error("CDP connection failed")), { once: true }); });
    let nextId = 0;
    const pending = new Map<number, { resolve: (message: CdpMessage) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params?.exceptionDetails;
        pageErrors.push(details?.exception?.description ?? details?.exception?.value ?? details?.text ?? "page exception");
      }
      if (!message.id) return;
      const waiting = pending.get(message.id);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      pending.delete(message.id);
      message.error ? waiting.reject(new Error(message.error.message ?? "CDP error")) : waiting.resolve(message);
    });
    const call = (method: string, params: Record<string, unknown> = {}) => new Promise<CdpMessage>((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30_000);
      pending.set(id, { resolve, reject, timer });
      socket!.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression: string): Promise<unknown> => (await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await call("Runtime.enable");
    await call("Page.enable");
    await call("Page.navigate", { url: `http://127.0.0.1:${server.port}/` });
    const suffix = () => pageErrors.length ? `: ${pageErrors[0]}` : "";
    if (!await eventually(() => evaluate(`document.body.innerText.includes(${JSON.stringify(marker)})`), Boolean, 15_000)) failure(`marker not rendered${suffix()}`);
    const probe = `AX11Y-PROBE-${crypto.randomUUID()}`;
    const wrote = await evaluate(`typeof window.termWrite === "function"`);
    if (!wrote) failure(`termWrite missing${suffix()}`);
    await evaluate(`window.termWrite(${JSON.stringify(probe)})`);
    if (!await eventually(() => evaluate(`document.body.innerText.includes(${JSON.stringify(probe)})`), Boolean, 2_000)) failure(`termWrite did not render${suffix()}`);
    if (!await evaluate("Array.isArray(window.termInput)")) failure(`termInput missing${suffix()}`);
    await evaluate("(document.body.querySelector('textarea,[tabindex],canvas'))?.focus()");
    await call("Input.insertText", { text: "abc" });
    if (!await eventually(() => evaluate("window.termInput.join('').includes('abc')"), Boolean, 2_000)) failure(`input not captured${suffix()}`);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${pageErrors.length ? `: ${pageErrors[0]}` : ""}`);
  } finally {
    socket?.close();
    chrome.kill("SIGKILL");
    server.stop();
  }
}

await main().catch((error) => {
  console.log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
