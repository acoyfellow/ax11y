export function commandShell(command: string): { command: string; args: string[] } {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", command] }
    : { command: "/bin/sh", args: ["-c", command] };
}
