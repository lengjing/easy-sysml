import { describe, expect, it } from 'vitest';

import { extractSseEvents } from '../components/ai/sse';

describe('extractSseEvents', () => {
  it('keeps incomplete event fragments in the remainder', () => {
    const parsed = extractSseEvents('event: delta\n');

    expect(parsed).toEqual({
      events: [],
      remainder: 'event: delta\n',
    });
  });

  it('parses complete events after chunk boundaries are rejoined', () => {
    const first = extractSseEvents('event: delta\n');
    const second = extractSseEvents(`${first.remainder}data: {"content":"abc"}\n\n`);

    expect(second).toEqual({
      events: [{ event: 'delta', data: '{"content":"abc"}' }],
      remainder: '',
    });
  });

  it('supports multi-line data payloads', () => {
    const parsed = extractSseEvents(
      'event: message\n' +
        'data: {"line":1,\n' +
        'data: "line":2}\n\n',
    );

    expect(parsed).toEqual({
      events: [{ event: 'message', data: '{"line":1,\n"line":2}' }],
      remainder: '',
    });
  });
});