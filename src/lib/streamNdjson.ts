export type OcrEvent =
  | { type: "status"; message: string }
  | { type: "token"; text: string; done: boolean }
  | { type: "error"; message: string }
  | { type: "complete" };

export async function* streamNdjson(
  response: Response,
): AsyncGenerator<OcrEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const parseLine = (line: string): OcrEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as OcrEvent;
    } catch {
      return null;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const event = parseLine(line);
      if (event) yield event;
    }
  }
  const event = parseLine(buffer);
  if (event) yield event;
}
