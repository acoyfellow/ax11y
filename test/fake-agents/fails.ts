import { writeFileSync } from "node:fs";
await Bun.stdin.text();
writeFileSync("solution.mjs", 'console.log("Hello, Bob!");\n');
console.log(JSON.stringify({ type: "message_update", message: { role: "assistant", usage: { totalTokens: 99999, cost: { total: 9 } } } }));
console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", usage: { totalTokens: 300, cost: { total: 0.001 } } } }));
console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", usage: { totalTokens: 300, cost: { total: 0.001 } } } }));
