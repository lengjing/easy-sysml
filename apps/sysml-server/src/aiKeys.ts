import { createHash, randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';

const API_KEY_PREFIX = 'esysml_';

export interface AiApiKeyRecord {
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

export type AiApiKeyAuthResult =
  | { status: 'ok'; record: AiApiKeyRecord }
  | { status: 'invalid' }
  | { status: 'insufficient_balance'; record: AiApiKeyRecord };

export interface AiApiUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generatePlaintextApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
}

export function listAiApiKeys(): AiApiKeyRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, key_prefix, created_at, updated_at, last_used_at, revoked_at,
              total_requests, total_input_tokens, total_output_tokens,
              total_cache_creation_input_tokens, total_cache_read_input_tokens, total_cost_usd,
              balance_usd
         FROM ai_api_keys
        ORDER BY created_at DESC`,
    )
    .all() as AiApiKeyRecord[];
}

export function createAiApiKey(
  name: string,
  initialBalanceUsd: number | null = null,
): { record: AiApiKeyRecord; plaintextKey: string } {
  const db = getDb();
  const plaintextKey = generatePlaintextApiKey();
  const now = Date.now();
  const id = uuidv4();
  const keyPrefix = plaintextKey.slice(0, 12);

  db.prepare(
    `INSERT INTO ai_api_keys (
      id, name, key_prefix, key_hash, created_at, updated_at, last_used_at, revoked_at,
      total_requests, total_input_tokens, total_output_tokens,
      total_cache_creation_input_tokens, total_cache_read_input_tokens, total_cost_usd, balance_usd
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 0, 0, 0, 0, ?)`,
  ).run(id, name, keyPrefix, hashApiKey(plaintextKey), now, now, initialBalanceUsd);

  const record = db
    .prepare(
      `SELECT id, name, key_prefix, created_at, updated_at, last_used_at, revoked_at,
              total_requests, total_input_tokens, total_output_tokens,
              total_cache_creation_input_tokens, total_cache_read_input_tokens, total_cost_usd,
              balance_usd
         FROM ai_api_keys
        WHERE id = ?`,
    )
    .get(id) as AiApiKeyRecord;

  return { record, plaintextKey };
}

export function revokeAiApiKey(id: string): boolean {
  const db = getDb();
  const result = db
    .prepare('UPDATE ai_api_keys SET revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(Date.now(), Date.now(), id);
  return result.changes > 0;
}

export function rechargeAiApiKey(id: string, amountUsd: number): AiApiKeyRecord | null {
  const db = getDb();
  const now = Date.now();
  const result = db
    .prepare(
      `UPDATE ai_api_keys
          SET balance_usd = COALESCE(balance_usd, 0) + ?,
              updated_at = ?
        WHERE id = ?`,
    )
    .run(amountUsd, now, id);

  if (result.changes === 0) {
    return null;
  }

  return db
    .prepare(
      `SELECT id, name, key_prefix, created_at, updated_at, last_used_at, revoked_at,
              total_requests, total_input_tokens, total_output_tokens,
              total_cache_creation_input_tokens, total_cache_read_input_tokens, total_cost_usd,
              balance_usd
         FROM ai_api_keys
        WHERE id = ?`,
    )
    .get(id) as AiApiKeyRecord;
}

export function authenticateAiApiKey(plaintextKey: string): AiApiKeyAuthResult {
  const db = getDb();
  const record = db
    .prepare(
      `SELECT id, name, key_prefix, created_at, updated_at, last_used_at, revoked_at,
              total_requests, total_input_tokens, total_output_tokens,
              total_cache_creation_input_tokens, total_cache_read_input_tokens, total_cost_usd,
              balance_usd
         FROM ai_api_keys
        WHERE key_hash = ?`,
    )
    .get(hashApiKey(plaintextKey)) as AiApiKeyRecord | undefined;

  if (!record || record.revoked_at !== null) {
    return { status: 'invalid' };
  }

  if (record.balance_usd !== null && record.total_cost_usd >= record.balance_usd) {
    return { status: 'insufficient_balance', record };
  }

  return { status: 'ok', record };
}

export function recordAiApiKeyUsage(
  keyId: string,
  usage: AiApiUsage | undefined,
  totalCostUsd: number | undefined,
): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `UPDATE ai_api_keys
        SET updated_at = ?,
            last_used_at = ?,
            total_requests = total_requests + 1,
            total_input_tokens = total_input_tokens + ?,
            total_output_tokens = total_output_tokens + ?,
            total_cache_creation_input_tokens = total_cache_creation_input_tokens + ?,
            total_cache_read_input_tokens = total_cache_read_input_tokens + ?,
            total_cost_usd = total_cost_usd + ?
      WHERE id = ?`,
  ).run(
    now,
    now,
    usage?.input_tokens ?? 0,
    usage?.output_tokens ?? 0,
    usage?.cache_creation_input_tokens ?? 0,
    usage?.cache_read_input_tokens ?? 0,
    totalCostUsd ?? 0,
    keyId,
  );
}