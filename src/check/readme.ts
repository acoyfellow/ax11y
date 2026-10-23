import type { ReadmeBlock } from "./types.js";

const codeFence = /^```([^\s`]*)\s*$/;

export function parseReadmeBlocks(text: string): ReadmeBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: ReadmeBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = codeFence.exec(lines[index]!);
    if (!opening) continue;
    const startLine = index + 2;
    const body: string[] = [];
    index += 1;
    while (index < lines.length && !/^```\s*$/.test(lines[index]!)) {
      body.push(lines[index]!);
      index += 1;
    }
    blocks.push({
      code: body.join("\n"),
      language: opening[1]!.toLowerCase(),
      startLine,
      skipped: index >= 2 && lines[index - body.length - 2]?.trim() === "<!-- ax11y-skip -->",
    });
  }
  return blocks;
}

export function isScriptBlock(block: ReadmeBlock): boolean {
  return ["js", "javascript", "jsx", "ts", "typescript", "tsx"].includes(block.language);
}
