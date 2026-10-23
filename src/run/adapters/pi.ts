export type TranscriptMetrics = { tokens: number; costUsd: number; toolCalls: number; turns: number };

export function piCommand(model: string): string[] {
  return ["pi", "-p", "--no-session", "--model", model, "--mode", "json"];
}

export function parseTranscript(text: string): TranscriptMetrics {
  let tokens = 0;
  let costUsd = 0;
  let toolCalls = 0;
  let turns = 0;
  for (const line of text.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { type?: string; message?: { role?: string; usage?: { totalTokens?: number; cost?: { total?: number } } } };
      if (event.type === "tool_execution_start") toolCalls++;
      if (event.type !== "message_end" || event.message?.role !== "assistant") continue;
      turns++;
      tokens += event.message.usage?.totalTokens ?? 0;
      costUsd += event.message.usage?.cost?.total ?? 0;
    } catch {}
  }
  return { tokens, costUsd, toolCalls, turns };
}
