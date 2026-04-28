import { describe, expect, it } from 'vitest';
import type { Response } from 'express';
import { handleFreeCodeMsg } from './directChat.js';

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function createResponseRecorder() {
  const chunks: string[] = [];
  const res = {
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } as unknown as Response;

  return {
    res,
    readEvents(): SseEvent[] {
      return chunks
        .join('')
        .trim()
        .split('\n\n')
        .filter(Boolean)
        .map(block => {
          const [eventLine, dataLine] = block.split('\n');
          return {
            event: eventLine.replace('event: ', ''),
            data: JSON.parse(dataLine.replace('data: ', '')) as Record<string, unknown>,
          };
        });
    },
  };
}

describe('handleFreeCodeMsg', () => {
  it('forwards assistant text content blocks as delta events', () => {
    const recorder = createResponseRecorder();
    const pendingToolUses = new Map<string, { name: string; input: Record<string, unknown> }>();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '生成完成' },
            { type: 'thinking', thinking: '分析模型结构' },
            { type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'model.sysml' } },
          ],
        },
      },
      pendingToolUses,
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: '生成完成' } },
      { event: 'thinking', data: { content: '分析模型结构' } },
      {
        event: 'tool_call',
        data: {
          id: 'tool-1',
          name: 'Write',
          input: { file_path: 'model.sysml' },
          status: 'running',
        },
      },
    ]);
    expect(pendingToolUses.get('tool-1')).toEqual({
      name: 'Write',
      input: { file_path: 'model.sysml' },
    });
  });

  it('forwards assistant string content as a delta event', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant',
        message: {
          content: '纯文本回复',
        },
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: '纯文本回复' } },
    ]);
  });

  it('forwards assistant partial messages as delta events', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'assistant_partial',
        delta: 'partial token',
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      { event: 'delta', data: { content: 'partial token' } },
    ]);
  });

  it('emits code events when a Write tool stores a SysML file', () => {
    const recorder = createResponseRecorder();
    const pendingToolUses = new Map<string, { name: string; input: Record<string, unknown> }>([
      [
        'tool-2',
        {
          name: 'Write',
          input: {
            file_path: 'models/drone.sysml',
            content: 'package DroneSystem {}',
          },
        },
      ],
    ]);

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'tool_result',
        tool_use_id: 'tool-2',
        is_error: false,
        content: [{ text: 'saved' }],
      },
      pendingToolUses,
      true,
    );

    expect(recorder.readEvents()).toEqual([
      {
        event: 'code',
        data: {
          content: 'package DroneSystem {}',
          language: 'sysml',
          autoApply: true,
          filePath: 'models/drone.sysml',
        },
      },
      {
        event: 'tool_call',
        data: {
          id: 'tool-2',
          status: 'completed',
          result: 'saved',
        },
      },
    ]);
    expect(pendingToolUses.has('tool-2')).toBe(false);
  });

  it('surfaces server-side session errors to the SSE stream', () => {
    const recorder = createResponseRecorder();

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'server_error',
        content: 'Error: Expected message role user',
      },
      new Map(),
      true,
    );

    handleFreeCodeMsg(
      recorder.res,
      {
        type: 'server_session_done',
        exit_code: 1,
      },
      new Map(),
      true,
    );

    expect(recorder.readEvents()).toEqual([
      {
        event: 'error',
        data: { content: 'Error: Expected message role user' },
      },
      {
        event: 'error',
        data: { content: 'free-code session exited with code 1' },
      },
    ]);
  });
});