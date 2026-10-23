# ax11y: accessibility for coding agents

## Definition
Agent readability is how much work it takes a coding agent, given only a published npm package (its README, types, `llms.txt`, and files in node_modules), to complete a real task with that package correctly. ax11y measures it in two layers, the way accessibility uses axe for fast static checks and real screen-reader users for full tests.

## Layer 1: `ax11y check <target>` (static, deterministic, no model)
Target: a directory containing a package (package.json at its root), or an npm spec (`name`, `name@version`) which ax11y installs into a temp dir with `npm pack` + extract (no install scripts run).

Output: list of findings `{ rule, level, severity, file, line, message, fix }`, a level result, `--json` for CI, non-zero exit when a finding at or below `--fail-level` exists.

Levels (each level includes the ones below it):
- A: an agent can find and import the package.
- AA: an agent can follow the documentation without guessing.
- AAA: an agent gets fast, precise feedback when it is wrong.

Rule set v1 (ids are stable; each rule has a planted fixture that only it flags):
| id | level | what it checks |
|---|---|---|
| `readme-present` | A | package has a README with at least one fenced code block in a JS/TS language |
| `entry-resolves` | A | `exports` / `main` / `module` / `types` paths in package.json exist in the package |
| `types-present` | A | the package ships TypeScript declarations for its main entry (own `types`/`typings`, `exports` types condition, or bundled .d.ts next to main) |
| `readme-imports-exist` | AA | every named import from this package in README code blocks is exported by the package's declared types |
| `readme-examples-typecheck` | AA | every README TS/JS code block that imports this package type-checks against the shipped declarations (blocks marked `<!-- ax11y-skip -->` on the line before are skipped) |
| `llms-txt` | AA | `llms.txt` exists at the package root, starts with an `# ` H1, has a `> ` summary line, and every relative link in it resolves inside the package |
| `exports-documented` | AAA | every runtime-exported value name of the main entry appears in README or llms.txt |
| `errors-actionable` | AAA | thrown Error messages in the shipped main JS are not bare (length >= 20 and not just the function name); reports each bare one with file:line |

One cause, one finding. Each defect is reported by exactly one rule:
- `readme-examples-typecheck` ignores diagnostics about names that are not exported (TS2305, TS2724, TS2614); `readme-imports-exist` owns those.
- Rules that need a file that is missing (README, declarations, main JS) skip silently; the rule that owns that file (`readme-present`, `types-present`, `entry-resolves`) reports it.
- `exports-documented` and `errors-actionable` read the main JS only when it resolves; otherwise they skip.

## Layer 2: `ax11y run <target> --task <task-dir>` (live agent runs)
- Each run: fresh temp dir, the target package placed in node_modules (no other help), the task prompt, one agent process, a hard timeout.
- Agent: an adapter. v1 ships the `pi` adapter (command `pi -p --no-session --model <model> --mode json`). The model is a required flag, recorded in every result.
- Each task dir: `task.md` (prompt; `{{package}}` substituted), `check.ts` (deterministic pass/fail; exits 0 on pass; may launch headless Chrome), optional `setup/` copied into the sandbox.
- Measures per run: pass, total tokens, cost, tool calls, turns, wall ms, invented imports (named imports from the package in written files that are not in its declared exports).
- Report: per target, median and IQR for tokens and turns, pass rate with Wilson 95% interval; comparison of two targets via Mann-Whitney U (two-sided, exact for n<=20) on tokens, with failed runs counted as +infinity tokens; "significant" means p < 0.05 AND median difference > 10%.
- Every report states agent, model, task, run count, date, ax11y version.

## Validity (proved in tests, and in the release gate)
- Each static rule fires on its planted fixture and on no other fixture, and nothing fires on the clean fixture.
- Two identical copies of a package: `ax11y run --compare` reports no significant difference.
- cloudterm with a planted broken README (quick start removed, a wrong export name in its example): significantly worse than clean cloudterm.

## Non-goals v1
- No hosted service. No LLM-as-judge anywhere. No score that mixes layers into one number.

## Repo shape
```
src/cli.ts            argv -> commands
src/check/            loader.ts (dir or npm spec), rules/*.ts (one file per rule), index.ts
src/run/              sandbox.ts, adapters/pi.ts, invented.ts, index.ts
src/report/           stats.ts (median, IQR, Wilson, Mann-Whitney), format.ts (text, json, markdown)
tasks/                built-in tasks (v1: `render-hello` for terminal/DOM packages, `basic-import` for any package)
fixtures/             clean + one planted fixture per rule
test/                 bun tests
```
TypeScript, ESM, Node >= 20, published as `ax11y` with a `bin`. Uses the `typescript` package for type checking. Build with tsdown to dist/. No source comments (the global hook rejects them).
