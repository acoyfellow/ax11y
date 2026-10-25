await Bun.stdin.text();
console.error('Error: Failed to load extension "broken/index.ts": Cannot find module "./cloud"');
process.exit(1);
