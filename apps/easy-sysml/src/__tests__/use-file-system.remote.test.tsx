// @vitest-environment jsdom

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileSystem, type UseFileSystemReturn } from '../hooks/useFileSystem';
import { getFileSystem } from '../lib/virtual-fs';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('useFileSystem remote sync', () => {
  let latestState: UseFileSystemReturn | null = null;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;
  let cleanup: (() => void) | null = null;

  function Harness({ projectId }: { projectId: string }) {
    latestState = useFileSystem(projectId);
    return null;
  }

  beforeEach(() => {
    latestState = null;
    getFileSystem().replaceAll([]);
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/projects/project-1/files') && method === 'GET') {
        return jsonResponse([
          {
            id: 'file-1',
            project_id: 'project-1',
            name: 'main.sysml',
            path: 'models/main.sysml',
            content: 'package Initial {}',
            created_at: 1,
            updated_at: 1,
          },
        ]);
      }

      if (url.endsWith('/api/projects/project-2/files') && method === 'GET') {
        return jsonResponse([]);
      }

      if (url.endsWith('/api/projects/project-2/files') && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
        return jsonResponse({
          id: 'file-2',
          project_id: 'project-2',
          name: body.name,
          path: body.path,
          content: body.content ?? '',
          created_at: 2,
          updated_at: 2,
        }, 201);
      }

      if (url.endsWith('/api/projects/project-2/files/file-2') && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
        return jsonResponse({
          id: 'file-2',
          project_id: 'project-2',
          name: body.name ?? 'main.sysml',
          path: body.path ?? 'main.sysml',
          content: body.content ?? '',
          created_at: 2,
          updated_at: 3,
        });
      }

      if (url.endsWith('/api/projects/project-2/files/file-2') && method === 'DELETE') {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: `Unhandled request: ${method} ${url}` }, 500);
    });
    globalThis.fetch = fetchMock as typeof fetch;
    if (typeof window !== 'undefined') {
      window.fetch = fetchMock as typeof fetch;
    }
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    globalThis.fetch = originalFetch;
    if (typeof window !== 'undefined') {
      window.fetch = originalFetch;
    }
  });

  it('loads remote project files into the file tree', async () => {
    const rendered = render(<Harness projectId="project-1" />);
    cleanup = rendered.unmount;

    await waitFor(() => expect(latestState?.ready).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/projects/project-1/files'));
    expect(latestState?.nodes.map(node => node.name)).toEqual(['models', 'main.sysml']);
    expect(latestState?.activeFile?.content).toBe('package Initial {}');
  });

  it('creates, saves, and deletes remote files through sysml-server', async () => {
    const rendered = render(<Harness projectId="project-2" />);
    cleanup = rendered.unmount;

    await waitFor(() => expect(latestState?.ready).toBe(true));

    act(() => {
      latestState?.createDirectory('models', null);
    });

    await waitFor(() => {
      expect(latestState?.nodes.some(node => node.type === 'directory' && node.name === 'models')).toBe(true);
    });

    const directoryId = latestState?.nodes.find(node => node.type === 'directory' && node.name === 'models')?.id;
    expect(directoryId).toBeTruthy();

    act(() => {
      latestState?.createFile('main.sysml', directoryId ?? null, 'package Draft {}');
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/project-2/files'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const fileId = latestState?.nodes.find(node => node.type === 'file' && node.name === 'main.sysml')?.id;
    expect(fileId).toBeTruthy();

    act(() => {
      latestState?.updateFileContent(fileId!, 'package Updated {}');
    });

    await new Promise(resolve => setTimeout(resolve, 450));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/project-2/files/file-2'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    act(() => {
      latestState?.deleteNode(fileId!);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/project-2/files/file-2'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});