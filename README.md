# ax11y

Accessibility for coding agents.

[![CI](https://github.com/acoyfellow/ax11y/actions/workflows/ci.yml/badge.svg)](https://github.com/acoyfellow/ax11y/actions/workflows/ci.yml)

## Quick start

```sh
npx ax11y check <pkg>
```

Use the library when a check is part of another tool.

```ts
import { check, rules, summarize, type Report } from "ax11y";

const report: Report = await check("<target>");
console.log(report.level, rules.length);
const summary = summarize({
  ax11yVersion: "0.1.0",
  agent: "pi",
  model: "example",
  task: "basic-import",
  target: { name: "example", version: "1.0.0" },
  date: new Date().toISOString(),
  runs: [],
});
console.log(summary.passes);
```

## Definition

Agent readability is how much work it takes a coding agent, given only a published npm package, to complete a real task with that package correctly. The published material is the README, types, `llms.txt`, and files in `node_modules`.

`ax11y check` is the static, deterministic layer. It inspects a package without a model. `ax11y run` is the live layer. It gives one agent one task in a fresh sandbox and records deterministic task results and measures.

## Levels

A means an agent can find and import the package. AA means an agent can follow the documentation without guessing. AAA means an agent gets fast, precise feedback when it is wrong. Each level includes the lower levels.

## Rules

| rule | level | checks | fix |
| --- | --- | --- | --- |
| `readme-present` | A | README and a JS or TS fenced example exist | Add a README with an example. |
| `entry-resolves` | A | declared entry paths exist | Correct the package entry paths. |
| `types-present` | A | the main entry ships declarations | Ship declarations for the main entry. |
| `readme-imports-exist` | AA | README named imports are declared exports | Correct imported names or declarations. |
| `readme-examples-typecheck` | AA | README examples type-check | Correct the example or declarations. |
| `llms-txt` | AA | llms.txt has a title, summary, and valid links | Add or repair llms.txt. |
| `exports-documented` | AAA | runtime exports are named in the docs | Document each runtime export. |
| `errors-actionable` | AAA | shipped Error messages state a useful fix | State what the user should do. |

## Agent runs

Run a built-in task with `ax11y run <pkg> --task basic-import --model <model>`. Results are written to `./ax11y-results/<target>-<task>-<timestamp>` by default, including `result.json` and each run's transcript; choose another directory with `--out <dir>`. Sandboxes are deleted after each run. Use `--keep` to retain them and inspect their paths in the result. Use `ax11y compare <a.json> <b.json>` for saved results, or `--compare <pkg>` to alternate two targets. The pi agent runs without your extensions or skills (`pi --no-extensions --no-skills`), so a score does not depend on what is installed in your `~/.pi`. If your model provider comes from an extension, load only that extension with `--pi-extension <path>` (repeatable). If the agent produces no assistant turn and no tokens, the run stops with a harness error and no score is recorded. Built-in tasks are listed by `ax11y tasks`; a task has `task.md`, a deterministic `check.ts`, and optional setup files.

The measures are pass, total tokens, cost, tool calls, turns, wall time, and invented imports. Reports show the median and IQR for tokens and turns and a Wilson 95% interval for pass rate. Comparison uses an exact Mann-Whitney U test when applicable. A result is significant only when `p < 0.05` and the median differs by more than 10%. Failed runs count as infinite tokens.

Example report:

```markdown
# cloudterm@0.0.14

| Metric | Value |
| --- | --- |
| Pass rate | 1/1 (100.0%) |
| Tokens median | 125328 |
| Tokens IQR | 125328–125328 |
| Turns median | 5 |
| Cost median | 0.1083179 |

agent pi, model gpt-5.6-terra, task render-hello, 1 runs, 2026-10-24, ax11y 0.1.0
```

## Limits

Every run score applies to one agent and one model on one task. Small run counts detect only large differences. Static rules check what is shipped, not whether the documentation is good prose. `run` needs bun. `render-hello` needs `chrome-headless-shell` from Playwright; install it with `npx playwright install chromium-headless-shell`. There is no LLM-as-judge anywhere. Version 1 adapters are pi and any command that speaks pi JSON lines.

## Writing a task

Create a directory with `task.md` and `check.ts`. Write a prompt in `task.md`; `{{package}}` is replaced with the target package name. Make `check.ts` exit zero only when the task is complete. Put optional sandbox inputs under `setup/`. Run it with `ax11y run <pkg> --task <directory> --model <model>`.

## CI usage

```sh
ax11y check . --fail-level AA
```

The library API exports `check`, `run`, `summarize`, `compare`, and `rules`. It also exports its report, rule, run, comparison, and summary types.

## License

MIT. See [LICENSE](LICENSE).
