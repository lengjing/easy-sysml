import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initDb } from '../db.js';
import { adminAuthRouter } from './adminAuth.js';
import { aiKeysRouter } from './aiKeys.js';

async function startRouteServer() {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'sysml-ai-keys-test-'));
  process.env.EASY_SYSML_ADMIN_USERNAME = 'admin';
  process.env.EASY_SYSML_ADMIN_PASSWORD = 'secret-pass';
  initDb(join(tmpRoot, 'sysml.db'));

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminAuthRouter);
  app.use('/api/ai/keys', aiKeysRouter);

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

async function loginAsAdmin(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/admin/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'admin',
      password: 'secret-pass',
    }),
  });

  if (!response.ok) {
    throw new Error(`Admin login failed with ${response.status}`);
  }

  const payload = await response.json() as { session_token: string };
  return payload.session_token;
}

describe('aiKeysRouter', () => {
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

  it('requires an admin session for AI key management', async () => {
    const response = await fetch(`${server!.baseUrl}/api/ai/keys`);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Admin session required' });
  });

  it('creates, lists, and revokes AI API keys', async () => {
    const adminSession = await loginAsAdmin(server!.baseUrl);
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-admin-session': adminSession,
    };

    const createResponse = await fetch(`${server!.baseUrl}/api/ai/keys`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: 'Workbench key', balance_usd: 3 }),
    });
    expect(createResponse.status).toBe(201);

    const created = await createResponse.json() as {
      api_key: string;
      record: { id: string; name: string; revoked_at: number | null; balance_usd: number | null };
    };
    expect(created.api_key.startsWith('esysml_')).toBe(true);
    expect(created.record.name).toBe('Workbench key');
    expect(created.record.balance_usd).toBe(3);

    const listResponse = await fetch(`${server!.baseUrl}/api/ai/keys`, {
      headers: { 'x-admin-session': adminSession },
    });
    expect(listResponse.status).toBe(200);
    const listed = await listResponse.json() as Array<{ id: string; revoked_at: number | null; balance_usd: number | null }>;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.record.id);
    expect(listed[0]?.balance_usd).toBe(3);

    const rechargeResponse = await fetch(`${server!.baseUrl}/api/ai/keys/${created.record.id}/recharge`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ amount_usd: 2.5 }),
    });
    expect(rechargeResponse.status).toBe(200);
    const recharged = await rechargeResponse.json() as { record: { balance_usd: number | null } };
    expect(recharged.record.balance_usd).toBe(5.5);

    const revokeResponse = await fetch(`${server!.baseUrl}/api/ai/keys/${created.record.id}`, {
      method: 'DELETE',
      headers: { 'x-admin-session': adminSession },
    });
    expect(revokeResponse.status).toBe(200);

    const afterRevoke = await fetch(`${server!.baseUrl}/api/ai/keys`, {
      headers: { 'x-admin-session': adminSession },
    });
    const revokedList = await afterRevoke.json() as Array<{ id: string; revoked_at: number | null }>;
    expect(revokedList[0]?.revoked_at).not.toBeNull();
  });
});