import { expect, test } from "bun:test";
import { parseReadmeBlocks } from "../src/check/readme.js";

test("parses fenced README examples with line numbers and skip markers", () => {
  const blocks = parseReadmeBlocks("# Package\n\n<!-- ax11y-skip -->\n```ts\nconst ignored = true;\n```\n\n```javascript\nconsole.log('used');\n```");
  expect(blocks).toEqual([
    { code: "const ignored = true;", language: "ts", startLine: 5, skipped: true },
    { code: "console.log('used');", language: "javascript", startLine: 9, skipped: false },
  ]);
});

test("README block starts map diagnostics to original lines", () => {
  const block = parseReadmeBlocks("# Package\n\n```ts\nconst value: number = 'wrong';\n```")[0]!;
  const offset = block.code.indexOf("'wrong'");
  const line = block.startLine + block.code.slice(0, offset).split("\n").length - 1;
  expect(line).toBe(4);
});
