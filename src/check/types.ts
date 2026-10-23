export type Level = "A" | "AA" | "AAA";

export type Finding = {
  rule: string;
  level: Level;
  severity: "error";
  file: string;
  line?: number;
  message: string;
  fix: string;
};

export type ReadmeBlock = {
  code: string;
  language: string;
  startLine: number;
  skipped: boolean;
};

export type CheckContext = {
  directory: string;
  packageJson: Record<string, unknown>;
  packageName: string;
  readmePath?: string;
  readmeText?: string;
  blocks: ReadmeBlock[];
  mainPath?: string;
  mainRelativePath?: string;
  typesPath?: string;
};

export type Rule = {
  id: string;
  level: Level;
  run(context: CheckContext): Finding[];
};
