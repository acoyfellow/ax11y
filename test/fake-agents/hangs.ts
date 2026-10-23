await Bun.stdin.text();
console.log(JSON.stringify({ type: "message_update", message: { role: "assistant", usage: { totalTokens: 99999, cost: { total: 9 } } } }));
console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", usage: { totalTokens: 100, cost: { total: 0 } } } }));
console.log(JSON.stringify({ type: "turn_end", message: { role: "assistant", usage: { totalTokens: 100, cost: { total: 0 } } } }));
setInterval(() => {}, 1000);
