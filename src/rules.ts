import { rule as entryResolves } from "./check/rules/entry-resolves.js";
import { rule as errorsActionable } from "./check/rules/errors-actionable.js";
import { rule as exportsDocumented } from "./check/rules/exports-documented.js";
import { rule as llmsTxt } from "./check/rules/llms-txt.js";
import { rule as readmeExamplesTypecheck } from "./check/rules/readme-examples-typecheck.js";
import { rule as readmeImportsExist } from "./check/rules/readme-imports-exist.js";
import { rule as readmePresent } from "./check/rules/readme-present.js";
import { rule as typesPresent } from "./check/rules/types-present.js";
import type { Rule } from "./check/types.js";

export const rules: readonly Rule[] = [readmePresent, entryResolves, typesPresent, readmeImportsExist, readmeExamplesTypecheck, llmsTxt, exportsDocumented, errorsActionable];
