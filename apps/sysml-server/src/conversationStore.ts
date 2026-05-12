import { getDb } from './db.js';
import { ensureStoredProjectWorkDir } from './projectStorage.js';

export interface ProjectContext {
  id: string;
  workDir: string;
}

export interface ConversationSummary {
  id: string;
  project_id: string;
  title: string;
  status: string;
  upstream_session_id: string | null;
  last_message_at: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ConversationMessageRecord {
  id: string;
  conversation_id: string;
  run_id: string | null;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  provider?: string;
  thinkingSteps: Array<{ content: string; timestamp: number }>;
  toolCalls: Array<{
    id?: string;
    name: string;
    input?: Record<string, unknown>;
    status: 'running' | 'completed' | 'error';
    result?: string;
    timestamp: number;
  }>;
  codesSynced: number;
  durationMs?: number;
  thinkingDurationMs?: number;
  sequence: number;
  created_at: number;
}

export interface ConversationRunRecord {
  id: string;
  conversation_id: string;
  status: string;
  trigger_message_id: string | null;
  assistant_message_id: string | null;
  model: string | null;
  usage: Record<string, unknown>;
  error_text: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

interface ConversationRow {
  id: string;
  project_id: string;
  title: string;
  status: string;
  upstream_session_id: string | null;
  last_message_at: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  run_id: string | null;
  role: 'user' | 'assistant' | 'error' | 'system';
  content_json: string;
  tool_calls_json: string;
  thinking_json: string;
  sequence: number;
  created_at: number;
}

interface ConversationRunRow {
  id: string;
  conversation_id: string;
  status: string;
  trigger_message_id: string | null;
  assistant_message_id: string | null;
  model: string | null;
  usage_json: string;
  error_text: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

interface StoredMessageContent {
  content: string;
  provider?: string;
  codesSynced?: number;
  durationMs?: number;
  thinkingDurationMs?: number;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapConversation(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    status: row.status,
    upstream_session_id: row.upstream_session_id,
    last_message_at: row.last_message_at,
    archived_at: row.archived_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMessage(row: ConversationMessageRow): ConversationMessageRecord {
  const content = parseJson<StoredMessageContent>(row.content_json, { content: '' });
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    run_id: row.run_id,
    role: row.role,
    content: content.content,
    provider: content.provider,
    thinkingSteps: parseJson(row.thinking_json, []),
    toolCalls: parseJson(row.tool_calls_json, []),
    codesSynced: content.codesSynced ?? 0,
    durationMs: content.durationMs,
    thinkingDurationMs: content.thinkingDurationMs,
    sequence: row.sequence,
    created_at: row.created_at,
  };
}

function mapRun(row: ConversationRunRow): ConversationRunRecord {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    status: row.status,
    trigger_message_id: row.trigger_message_id,
    assistant_message_id: row.assistant_message_id,
    model: row.model,
    usage: parseJson(row.usage_json, {}),
    error_text: row.error_text,
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}

export function getProjectContext(projectId: string): ProjectContext | null {
  const project = getDb()
    .prepare('SELECT id, work_dir FROM projects WHERE id = ?')
    .get(projectId) as { id: string; work_dir?: string } | undefined;

  if (!project) {
    return null;
  }

  return {
    id: project.id,
    workDir: ensureStoredProjectWorkDir(project.id, project.work_dir),
  };
}

export function listConversations(projectId: string): ConversationSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT *
       FROM conversations
       WHERE project_id = ? AND archived_at IS NULL
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .all(projectId) as ConversationRow[];
  return rows.map(mapConversation);
}

export function createConversation(projectId: string, title?: string): ConversationSummary {
  const now = Date.now();
  const rowId = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO conversations (
         id, project_id, title, status, upstream_session_id,
         last_message_at, archived_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'active', NULL, NULL, NULL, ?, ?)`,
    )
    .run(rowId, projectId, title?.trim() || '新对话', now, now);

  return getConversation(projectId, rowId)!;
}

export function getConversation(projectId: string, conversationId: string): ConversationSummary | null {
  const row = getDb()
    .prepare('SELECT * FROM conversations WHERE project_id = ? AND id = ?')
    .get(projectId, conversationId) as ConversationRow | undefined;
  return row ? mapConversation(row) : null;
}

export function updateConversation(
  projectId: string,
  conversationId: string,
  patch: { title?: string; status?: string; archived?: boolean },
): ConversationSummary | null {
  const existing = getConversation(projectId, conversationId);
  if (!existing) {
    return null;
  }

  const sets: string[] = ['updated_at = ?'];
  const values: Array<string | number | null> = [Date.now()];

  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title.trim() || existing.title);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.archived !== undefined) {
    sets.push('archived_at = ?');
    values.push(patch.archived ? Date.now() : null);
  }

  values.push(projectId, conversationId);
  getDb()
    .prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE project_id = ? AND id = ?`)
    .run(...values);

  return getConversation(projectId, conversationId);
}

export function deleteConversation(projectId: string, conversationId: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM conversations WHERE project_id = ? AND id = ?')
    .run(projectId, conversationId);
  return result.changes > 0;
}

export function listConversationMessages(
  projectId: string,
  conversationId: string,
): ConversationMessageRecord[] | null {
  if (!getConversation(projectId, conversationId)) {
    return null;
  }

  const rows = getDb()
    .prepare(
      `SELECT *
       FROM conversation_messages
       WHERE conversation_id = ?
       ORDER BY sequence ASC, created_at ASC`,
    )
    .all(conversationId) as ConversationMessageRow[];

  return rows.map(mapMessage);
}

export function listConversationHistoryForReplay(
  projectId: string,
  conversationId: string,
  excludeMessageId?: string,
): Array<{ role: 'user' | 'assistant'; content: string }> | null {
  const messages = listConversationMessages(projectId, conversationId);
  if (!messages) {
    return null;
  }

  return messages
    .filter(message => message.id !== excludeMessageId)
    .filter(
      (message): message is ConversationMessageRecord & { role: 'user' | 'assistant' } =>
        (message.role === 'user' || message.role === 'assistant') && Boolean(message.content.trim()),
    )
    .map(message => ({
      role: message.role,
      content: message.content,
    }));
}

function getNextMessageSequence(conversationId: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM conversation_messages WHERE conversation_id = ?')
    .get(conversationId) as { max_sequence: number };
  return row.max_sequence + 1;
}

export function appendConversationMessage(
  projectId: string,
  conversationId: string,
  input: {
    role: 'user' | 'assistant' | 'error' | 'system';
    runId?: string | null;
    content: string;
    provider?: string;
    thinkingSteps?: Array<{ content: string; timestamp: number }>;
    toolCalls?: Array<{
      id?: string;
      name: string;
      input?: Record<string, unknown>;
      status: 'running' | 'completed' | 'error';
      result?: string;
      timestamp: number;
    }>;
    codesSynced?: number;
    durationMs?: number;
    thinkingDurationMs?: number;
    createdAt?: number;
  },
): ConversationMessageRecord | null {
  if (!getConversation(projectId, conversationId)) {
    return null;
  }

  const now = input.createdAt ?? Date.now();
  const messageId = crypto.randomUUID();
  const sequence = getNextMessageSequence(conversationId);

  getDb()
    .prepare(
      `INSERT INTO conversation_messages (
         id, conversation_id, run_id, role, content_json,
         tool_calls_json, thinking_json, sequence, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      messageId,
      conversationId,
      input.runId ?? null,
      input.role,
      JSON.stringify({
        content: input.content,
        provider: input.provider,
        codesSynced: input.codesSynced ?? 0,
        durationMs: input.durationMs,
        thinkingDurationMs: input.thinkingDurationMs,
      }),
      JSON.stringify(input.toolCalls ?? []),
      JSON.stringify(input.thinkingSteps ?? []),
      sequence,
      now,
    );

  const derivedTitle =
    input.role === 'user' && input.content.trim()
      ? input.content.trim().slice(0, 40) + (input.content.trim().length > 40 ? '…' : '')
      : null;

  const existing = getConversation(projectId, conversationId);
  const title = existing && existing.title === '新对话' && derivedTitle ? derivedTitle : undefined;
  touchConversation(projectId, conversationId, now, title);

  const row = getDb()
    .prepare('SELECT * FROM conversation_messages WHERE id = ?')
    .get(messageId) as ConversationMessageRow | undefined;
  return row ? mapMessage(row) : null;
}

export function createConversationRun(
  projectId: string,
  conversationId: string,
  triggerMessageId: string,
): ConversationRunRecord | null {
  if (!getConversation(projectId, conversationId)) {
    return null;
  }

  const now = Date.now();
  const runId = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO conversation_runs (
         id, conversation_id, status, trigger_message_id, assistant_message_id,
         model, usage_json, error_text, started_at, completed_at, created_at
       ) VALUES (?, ?, 'running', ?, NULL, NULL, '{}', NULL, ?, NULL, ?)`,
    )
    .run(runId, conversationId, triggerMessageId, now, now);

  return getConversationRun(projectId, conversationId, runId);
}

export function getConversationRun(
  projectId: string,
  conversationId: string,
  runId: string,
): ConversationRunRecord | null {
  if (!getConversation(projectId, conversationId)) {
    return null;
  }

  const row = getDb()
    .prepare('SELECT * FROM conversation_runs WHERE conversation_id = ? AND id = ?')
    .get(conversationId, runId) as ConversationRunRow | undefined;
  return row ? mapRun(row) : null;
}

export function listConversationRuns(
  projectId: string,
  conversationId: string,
): ConversationRunRecord[] | null {
  if (!getConversation(projectId, conversationId)) {
    return null;
  }

  const rows = getDb()
    .prepare(
      `SELECT *
       FROM conversation_runs
       WHERE conversation_id = ?
       ORDER BY created_at DESC`,
    )
    .all(conversationId) as ConversationRunRow[];
  return rows.map(mapRun);
}

export function completeConversationRun(
  projectId: string,
  conversationId: string,
  runId: string,
  patch: {
    assistantMessageId?: string | null;
    model?: string | null;
    usage?: Record<string, unknown>;
    errorText?: string | null;
    status: 'completed' | 'failed';
  },
): ConversationRunRecord | null {
  if (!getConversation(projectId, conversationId)) {
    return null;
  }

  const completedAt = Date.now();
  getDb()
    .prepare(
      `UPDATE conversation_runs
       SET status = ?, assistant_message_id = ?, model = ?, usage_json = ?, error_text = ?, completed_at = ?
       WHERE conversation_id = ? AND id = ?`,
    )
    .run(
      patch.status,
      patch.assistantMessageId ?? null,
      patch.model ?? null,
      JSON.stringify(patch.usage ?? {}),
      patch.errorText ?? null,
      completedAt,
      conversationId,
      runId,
    );

  touchConversation(projectId, conversationId, completedAt);
  return getConversationRun(projectId, conversationId, runId);
}

export function setConversationUpstreamSessionId(
  projectId: string,
  conversationId: string,
  upstreamSessionId: string,
): ConversationSummary | null {
  getDb()
    .prepare(
      `UPDATE conversations
       SET upstream_session_id = ?, updated_at = ?
       WHERE project_id = ? AND id = ?`,
    )
    .run(upstreamSessionId, Date.now(), projectId, conversationId);
  return getConversation(projectId, conversationId);
}

export function touchConversation(
  projectId: string,
  conversationId: string,
  at: number,
  title?: string,
): void {
  if (title !== undefined) {
    getDb()
      .prepare(
        `UPDATE conversations
         SET title = ?, last_message_at = ?, updated_at = ?
         WHERE project_id = ? AND id = ?`,
      )
      .run(title, at, at, projectId, conversationId);
    return;
  }

  getDb()
    .prepare(
      `UPDATE conversations
       SET last_message_at = ?, updated_at = ?
       WHERE project_id = ? AND id = ?`,
    )
    .run(at, at, projectId, conversationId);
}