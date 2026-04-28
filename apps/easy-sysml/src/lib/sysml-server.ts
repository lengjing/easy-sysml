export interface ServerProjectRecord {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

export interface ServerFileRecord {
  id: string;
  project_id: string;
  name: string;
  path: string;
  content: string;
  created_at: number;
  updated_at: number;
}

function apiUrl(path: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return new URL(path, 'http://localhost').toString();
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listProjects(): Promise<ServerProjectRecord[]> {
  const response = await fetch(apiUrl('/api/projects'));
  return readJson<ServerProjectRecord[]>(response);
}

export async function createProject(input: {
  name: string;
  description?: string;
}): Promise<ServerProjectRecord> {
  const response = await fetch(apiUrl('/api/projects'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return readJson<ServerProjectRecord>(response);
}

export async function listProjectFiles(projectId: string): Promise<ServerFileRecord[]> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/files`));
  return readJson<ServerFileRecord[]>(response);
}

export async function createProjectFile(
  projectId: string,
  input: { name: string; path: string; content?: string },
): Promise<ServerFileRecord> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/files`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return readJson<ServerFileRecord>(response);
}

export async function updateProjectFile(
  projectId: string,
  fileId: string,
  input: { name?: string; path?: string; content?: string },
): Promise<ServerFileRecord> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/files/${fileId}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return readJson<ServerFileRecord>(response);
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/projects/${projectId}/files/${fileId}`), {
    method: 'DELETE',
  });
  await readJson<{ ok: boolean }>(response);
}