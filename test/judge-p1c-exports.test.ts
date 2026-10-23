import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "ax11y-p1c-"));

type Finding = { rule: string; file: string; line?: number; message: string };
type Report = { findings: Finding[]; level: string };

function check(target: string): Report {
  const result = Bun.spawnSync(["bun", join(repo, "src", "cli.ts"), "check", target, "--json"], { stdout: "pipe", stderr: "pipe" });
  return JSON.parse(result.stdout.toString());
}

function makePackage(name: string, declarations: string, extraFiles: Record<string, string> = {}): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "shape-fixture", version: "1.0.0", type: "module", main: "./index.js", types: "./index.d.ts" }));
  writeFileSync(join(dir, "index.js"), "export function mount(el) { return el; }\nexport class Terminal {}\nexport const VERSION = \"1\";\nexport default function create() { return 1; }\n");
  writeFileSync(join(dir, "index.d.ts"), declarations);
  writeFileSync(join(dir, "README.md"), "# shape-fixture\n\n```ts\nimport create, { mount, Terminal, VERSION } from \"shape-fixture\";\nimport type { Options } from \"shape-fixture\";\n\nconst options: Options = { size: 1 };\nconst el: HTMLElement = document.createElement(\"div\");\nconsole.log(mount(el), new Terminal(), VERSION, create(), options);\n```\n\n`mount`, `Terminal`, `VERSION`, `create` and `Options` are documented here.\n");
  writeFileSync(join(dir, "llms.txt"), "# shape-fixture\n\n> Mount a terminal.\n\n- [README](./README.md)\n");
  for (const [file, text] of Object.entries(extraFiles)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

const shapes: Record<string, [string, Record<string, string>?]> = {
  "export-declare": ["export declare function mount(el: HTMLElement): HTMLElement;\nexport declare class Terminal {}\nexport declare const VERSION: string;\nexport interface Options { size: number }\nexport default function create(): number;\n"],
  "export-list": ["declare function mount(el: HTMLElement): HTMLElement;\ndeclare class Terminal {}\ndeclare const VERSION: string;\ninterface Options { size: number }\ndeclare function create(): number;\nexport { mount, Terminal, VERSION, type Options };\nexport default create;\n"],
  "export-list-renamed": ["declare function mountImpl(el: HTMLElement): HTMLElement;\ndeclare class TerminalImpl {}\ndeclare const V: string;\ninterface OptionsImpl { size: number }\ndeclare function createImpl(): number;\nexport { mountImpl as mount, TerminalImpl as Terminal, V as VERSION, type OptionsImpl as Options, createImpl as default };\n"],
  "export-star": ["export * from \"./api.js\";\nexport { default } from \"./create.js\";\n", { "api.d.ts": "export declare function mount(el: HTMLElement): HTMLElement;\nexport declare class Terminal {}\nexport declare const VERSION: string;\nexport interface Options { size: number }\n", "create.d.ts": "export default function create(): number;\n" }],
  "export-named-from": ["export { mount, Terminal, VERSION } from \"./api.js\";\nexport type { Options } from \"./api.js\";\nexport { default } from \"./create.js\";\n", { "api.d.ts": "export declare function mount(el: HTMLElement): HTMLElement;\nexport declare class Terminal {}\nexport declare const VERSION: string;\nexport interface Options { size: number }\n", "create.d.ts": "export default function create(): number;\n" }],
};

describe("every common declaration shape: zero findings", () => {
  for (const [name, [declarations, extra]] of Object.entries(shapes)) {
    test(name, () => {
      const report = check(makePackage(name, declarations, extra));
      expect(report.findings).toEqual([]);
      expect(report.level).toBe("AAA");
    });
  }
});

test("a name truly missing from an export list is still flagged", () => {
  const dir = makePackage("missing-from-list", "declare function mount(el: HTMLElement): HTMLElement;\ndeclare class Terminal {}\ndeclare const VERSION: string;\ninterface Options { size: number }\ndeclare function create(): number;\nexport { mount, VERSION, type Options };\nexport default create;\n");
  const report = check(dir);
  const flagged = report.findings.filter((finding) => finding.rule === "readme-imports-exist");
  expect(flagged.length).toBe(1);
  expect(flagged[0]!.message).toContain("Terminal");
  expect(flagged[0]!.line).toBe(4);
});

test("cloudterm@0.0.14: mount is exported, so no readme-imports-exist finding", () => {
  const report = check("cloudterm@0.0.14");
  expect(report.findings.filter((finding) => finding.rule === "readme-imports-exist")).toEqual([]);
}, 120000);

test("cloudterm@0.0.14: the real Element | null mismatch is still reported", () => {
  const report = check("cloudterm@0.0.14");
  const typecheck = report.findings.filter((finding) => finding.rule === "readme-examples-typecheck");
  expect(typecheck.some((finding) => finding.message.includes("Element | null"))).toBe(true);
}, 120000);

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
