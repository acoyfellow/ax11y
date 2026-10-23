const result = Bun.spawnSync(["node", "solution.mjs"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
process.exit(result.exitCode === 0 && result.stdout.toString().includes("Hello, Ada!") ? 0 : 1);
