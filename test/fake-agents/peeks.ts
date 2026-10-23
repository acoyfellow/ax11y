import { existsSync, readdirSync, writeFileSync } from "node:fs";
await Bun.stdin.text();
const seen = { cwdEntries: readdirSync(".").sort(), parentHasRepo: existsSync("../package.json") || existsSync("../../package.json") };
writeFileSync(".peek.json", JSON.stringify(seen));
console.log(JSON.stringify({ type: "message_update", message: { role: "assistant", usage: { totalTokens: 99999, cost: { total: 9 } } } }));
console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", usage: { totalTokens: 10, cost: { total: 0 } } } }));
console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", usage: { totalTokens: 10, cost: { total: 0 } } } }));
