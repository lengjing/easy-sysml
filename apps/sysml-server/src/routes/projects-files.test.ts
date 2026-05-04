import express from 'express';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from '../db.js';
import { filesRouter } from './files.js';
import { projectsRouter } from './projects.js';

async function startRouteServer() {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'sysml-server-test-'));
  process.env.SYSML_PROJECTS_ROOT = join(tmpRoot, 'projects');
  initDb(join(tmpRoot, 'sysml.db'));

  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectsRouter);
  app.use('/api/projects/:projectId/files', filesRouter);

  const server = createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine test server address');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

describe('projects and files routes', () => {
  let server: Awaited<ReturnType<typeof startRouteServer>> | undefined;

  beforeEach(async () => {
    server = await startRouteServer();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it('creates, lists, updates, and deletes projects', async () => {
    const baseUrl = server!.baseUrl;

    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Flight Control', description: 'UAV core project' }),
    });

    expect(createResponse.status).toBe(201);
    const createdProject = await createResponse.json() as {
      id: string;
      name: string;
      description: string;
      work_dir: string;
    };
    expect(createdProject.name).toBe('Flight Control');
    expect(createdProject.work_dir).toContain(createdProject.id);
    expect(existsSync(createdProject.work_dir)).toBe(true);

    const listResponse = await fetch(`${baseUrl}/api/projects`);
    expect(listResponse.status).toBe(200);
    const projects = await listResponse.json() as Array<{ id: string; name: string }>;
    expect(projects).toHaveLength(1);
    expect(projects[0]?.id).toBe(createdProject.id);

    const updateResponse = await fetch(`${baseUrl}/api/projects/${createdProject.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Flight Control Updated' }),
    });
    expect(updateResponse.status).toBe(200);
    const updatedProject = await updateResponse.json() as { name: string };
    expect(updatedProject.name).toBe('Flight Control Updated');

    const deleteResponse = await fetch(`${baseUrl}/api/projects/${createdProject.id}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(200);
    expect(existsSync(createdProject.work_dir)).toBe(false);

    const missingResponse = await fetch(`${baseUrl}/api/projects/${createdProject.id}`);
    expect(missingResponse.status).toBe(404);
  });

  it('creates, updates, renames path, and deletes project files', async () => {
    const baseUrl = server!.baseUrl;

    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vehicle Project' }),
    });
    const project = await projectResponse.json() as { id: string };
    const projectRecordResponse = await fetch(`${baseUrl}/api/projects/${project.id}`);
    const projectRecord = await projectRecordResponse.json() as { work_dir: string };

    const createFileResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'main.sysml',
        path: 'models/main.sysml',
        content: 'package Vehicle {}',
      }),
    });
    expect(createFileResponse.status).toBe(201);
    const file = await createFileResponse.json() as { id: string; path: string; content: string; type: string };
    expect(file.path).toBe('models/main.sysml');
    expect(file.type).toBe('file');
    expect(readFileSync(join(projectRecord.work_dir, 'models', 'main.sysml'), 'utf8')).toBe('package Vehicle {}');

    // Rename + update content via PUT — the ID changes because it's path-derived
    const updateFileResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files/${file.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'vehicle.sysml',
        path: 'architecture/vehicle.sysml',
        content: 'package VehicleArchitecture {}',
      }),
    });
    expect(updateFileResponse.status).toBe(200);
    const updatedFile = await updateFileResponse.json() as {
      id: string;
      name: string;
      path: string;
      content: string;
    };
    expect(updatedFile.name).toBe('vehicle.sysml');
    expect(updatedFile.path).toBe('architecture/vehicle.sysml');
    expect(updatedFile.content).toContain('VehicleArchitecture');
    // ID is now based on the new path
    expect(updatedFile.id).not.toBe(file.id);
    expect(readFileSync(join(projectRecord.work_dir, 'architecture', 'vehicle.sysml'), 'utf8')).toContain('VehicleArchitecture');

    // Listing returns nodes from the filesystem — use the updated ID
    const listFilesResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`);
    expect(listFilesResponse.status).toBe(200);
    const nodes = await listFilesResponse.json() as Array<{ id: string; path: string; type: string }>;
    const fileNode = nodes.find(n => n.type === 'file' && n.path === 'architecture/vehicle.sysml');
    expect(fileNode).toBeDefined();
    expect(fileNode?.id).toBe(updatedFile.id);

    // Delete using the updated ID
    const deleteFileResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files/${updatedFile.id}`, {
      method: 'DELETE',
    });
    expect(deleteFileResponse.status).toBe(200);
    expect(existsSync(join(projectRecord.work_dir, 'architecture', 'vehicle.sysml'))).toBe(false);
  });

  it('creates and deletes a directory', async () => {
    const baseUrl = server!.baseUrl;

    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dir Test Project' }),
    });
    const project = await projectResponse.json() as { id: string };
    const projectRecord = await (await fetch(`${baseUrl}/api/projects/${project.id}`)).json() as { work_dir: string };

    // Create a directory
    const createDirResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'subsystems', path: 'subsystems', type: 'directory' }),
    });
    expect(createDirResponse.status).toBe(201);
    const dir = await createDirResponse.json() as { id: string; type: string; path: string };
    expect(dir.type).toBe('directory');
    expect(dir.path).toBe('subsystems');
    expect(existsSync(join(projectRecord.work_dir, 'subsystems'))).toBe(true);

    // Directory appears in listing
    const listResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`);
    const nodes = await listResponse.json() as Array<{ type: string; path: string }>;
    expect(nodes.some(n => n.type === 'directory' && n.path === 'subsystems')).toBe(true);

    // Delete the directory
    const deleteDirResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files/${dir.id}`, {
      method: 'DELETE',
    });
    expect(deleteDirResponse.status).toBe(200);
    expect(existsSync(join(projectRecord.work_dir, 'subsystems'))).toBe(false);
  });

  it('rejects invalid or conflicting file paths', async () => {
      const baseUrl = server!.baseUrl;

      const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Path Rules' }),
    });
    const project = await projectResponse.json() as { id: string };

      const invalidPathResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad.sysml', path: '../bad.sysml' }),
    });
    expect(invalidPathResponse.status).toBe(400);

      const firstFileResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'one.sysml', path: 'models/one.sysml' }),
    });
    const firstFile = await firstFileResponse.json() as { id: string };

      const secondFileResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'two.sysml', path: 'models/two.sysml' }),
    });
    const secondFile = await secondFileResponse.json() as { id: string };

      const conflictingRenameResponse = await fetch(`${baseUrl}/api/projects/${project.id}/files/${secondFile.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'models/one.sysml' }),
    });
    expect(conflictingRenameResponse.status).toBe(409);

      const firstFileFetch = await fetch(`${baseUrl}/api/projects/${project.id}/files/${firstFile.id}`);
    expect(firstFileFetch.status).toBe(200);
  });
});