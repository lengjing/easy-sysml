export interface ServerProjectRecord {
  id: string;
  name: string;
  description: string;
  work_dir: string;
  created_at: number;
  updated_at: number;
}

export interface ServerAiApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_input_tokens: number;
  total_cache_read_input_tokens: number;
  total_cost_usd: number;
  balance_usd: number | null;
}

export interface ServerAdminSessionStatus {
  authenticated: boolean;
  username?: string;
}

export interface ServerAdminLoginResponse {
  ok: boolean;
  username: string;
  session_token: string;
  session_header: string;
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

function buildAdminHeaders(sessionToken?: string, includeJsonContentType = false): HeadersInit {
  return {
    ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(sessionToken ? { 'X-Admin-Session': sessionToken } : {}),
  };
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

export async function listAiApiKeys(sessionToken: string): Promise<ServerAiApiKeyRecord[]> {
  const response = await fetch(apiUrl('/api/ai/keys'), {
    headers: buildAdminHeaders(sessionToken),
  });
  return readJson<ServerAiApiKeyRecord[]>(response);
}

export async function createAiApiKey(
  sessionToken: string,
  name?: string,
  balanceUsd?: number | null,
): Promise<{
  record: ServerAiApiKeyRecord;
  api_key: string;
}> {
  const response = await fetch(apiUrl('/api/ai/keys'), {
    method: 'POST',
    headers: buildAdminHeaders(sessionToken, true),
    body: JSON.stringify({ name, balance_usd: balanceUsd }),
  });
  return readJson<{ record: ServerAiApiKeyRecord; api_key: string }>(response);
}

export async function rechargeAiApiKey(
  sessionToken: string,
  id: string,
  amountUsd: number,
): Promise<ServerAiApiKeyRecord> {
  const response = await fetch(apiUrl(`/api/ai/keys/${id}/recharge`), {
    method: 'POST',
    headers: buildAdminHeaders(sessionToken, true),
    body: JSON.stringify({ amount_usd: amountUsd }),
  });
  const result = await readJson<{ ok: boolean; record: ServerAiApiKeyRecord }>(response);
  return result.record;
}

export async function revokeAiApiKey(sessionToken: string, id: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/ai/keys/${id}`), {
    method: 'DELETE',
    headers: buildAdminHeaders(sessionToken),
  });
  await readJson<{ ok: boolean }>(response);
}

export async function getAdminSession(sessionToken?: string): Promise<ServerAdminSessionStatus> {
  const response = await fetch(apiUrl('/api/admin/session'), {
    headers: buildAdminHeaders(sessionToken),
  });
  return readJson<ServerAdminSessionStatus>(response);
}

export async function loginAdminSession(
  username: string,
  password: string,
): Promise<ServerAdminLoginResponse> {
  const response = await fetch(apiUrl('/api/admin/session/login'), {
    method: 'POST',
    headers: buildAdminHeaders(undefined, true),
    body: JSON.stringify({ username, password }),
  });
  return readJson<ServerAdminLoginResponse>(response);
}

export async function logoutAdminSession(sessionToken: string): Promise<void> {
  const response = await fetch(apiUrl('/api/admin/session'), {
    method: 'DELETE',
    headers: buildAdminHeaders(sessionToken),
  });
  await readJson<{ ok: boolean }>(response);
}