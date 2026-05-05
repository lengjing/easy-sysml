export interface ParsedSseEvent {
  event: string;
  data: string;
}

export function extractSseEvents(rawBuffer: string): {
  events: ParsedSseEvent[];
  remainder: string;
} {
  const buffer = rawBuffer.replace(/\r\n/g, '\n');
  const segments = buffer.split('\n\n');
  const remainder = segments.pop() ?? '';
  const events: ParsedSseEvent[] = [];

  for (const segment of segments) {
    if (!segment.trim()) {
      continue;
    }

    let event = '';
    const dataLines: string[] = [];

    for (const line of segment.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart());
      }
    }

    if (!event || dataLines.length === 0) {
      continue;
    }

    events.push({
      event,
      data: dataLines.join('\n'),
    });
  }

  return { events, remainder };
}