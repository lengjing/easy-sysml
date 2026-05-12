/**
 * Hook: useChatSessions
 *
 * Manages the AI chat UI around project-scoped conversations.
 *
 * When a `projectId` is provided, conversation summaries are loaded from the
 * server (`/api/projects/:projectId/conversations`). Individual transcripts are
 * loaded lazily from `/messages` when a conversation is activated. Without a
 * project, sessions fall back to an in-memory store and cannot be persisted.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createConversation,
  deleteConversation,
  listConversationMessages,
  listConversations,
  type ServerConversation,
  type ServerConversationMessage,
} from '../lib/sysml-server';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface ThinkingStep {
  content: string;
  timestamp: number;
}

export interface ToolCall {
  id?: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  provider?: string;
  thinkingSteps: ThinkingStep[];
  toolCalls: ToolCall[];
  codesSynced: number;
  durationMs?: number;
  thinkingDurationMs?: number;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  conversationId: string | null;
  createdAt: number;
  /** True while the session is being synced to the server */
  pending?: boolean;
}

export interface UseChatSessionsReturn {
  /** Ordered session list (most recently updated first) */
  sessions: ChatSession[];
  /** ID of the active session */
  activeSessionId: string;
  /** Messages of the active session */
  messages: ChatMessage[];
  /** Conversation ID associated with the active session */
  conversationId: string | null;
  /** True while the session list is loading from the server */
  loading: boolean;
  /** True once the session list has been requested for the current project */
  loaded: boolean;

  /** Switch to an existing session (loads messages if not already loaded) */
  switchSession: (sessionId: string) => void;
  /** Load the remote session list if it has not been loaded yet */
  ensureLoaded: () => Promise<void>;
  /** Ensure the active temp session is created on the backend and has a stable ID */
  ensureActiveSession: (seedMessages?: ChatMessage[]) => Promise<ChatSession | null>;
  /** Create a new empty session and make it active */
  newSession: () => void;
  /** Delete a session */
  deleteSession: (sessionId: string) => void;
  /**
   * Update messages in the active session (UI state only — no server call).
   * Call this for intermediate UI updates during streaming.
   */
  setMessages: (messages: ChatMessage[]) => void;
  /** Update the conversationId of the active session (in-memory only) */
  setConversationId: (id: string | null) => void;
  /** Keep the old API surface for local-only state updates after a turn */
  saveSession: (messages: ChatMessage[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let _nextTempId = 0;
function makeTempId(): string {
  return `temp-${Date.now()}-${_nextTempId++}`;
}

function makeEmptySession(): ChatSession {
  return {
    id: makeTempId(),
    title: '新对话',
    messages: [],
    conversationId: null,
    createdAt: Date.now(),
  };
}

const MAX_TITLE_LENGTH = 40;

function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find(m => m.role === 'user');
  if (!first) return '新对话';
  const text = first.content.slice(0, MAX_TITLE_LENGTH);
  return first.content.length > MAX_TITLE_LENGTH ? `${text}…` : text;
}

function fromServerSession(s: ServerConversation, messages?: ChatMessage[]): ChatSession {
  return {
    id: s.id,
    title: s.title,
    messages: messages ?? [],
    conversationId: s.id,
    createdAt: s.created_at,
  };
}

function fromServerMessage(message: ServerConversationMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    provider: message.provider,
    thinkingSteps: message.thinkingSteps,
    toolCalls: message.toolCalls,
    codesSynced: message.codesSynced,
    durationMs: message.durationMs,
    thinkingDurationMs: message.thinkingDurationMs,
    timestamp: message.created_at,
  };
}

function mergeServerSessions(
  serverSessions: ServerConversation[],
  previousSessions: ChatSession[],
  activeSessionId: string,
): ChatSession[] {
  const previousById = new Map(previousSessions.map(session => [session.id, session]));
  const merged = serverSessions.map(serverSession => {
    const existing = previousById.get(serverSession.id);
    return fromServerSession(serverSession, existing?.messages);
  });

  const activeTempSession = previousSessions.find(
    session => session.id === activeSessionId && session.id.startsWith('temp-'),
  );
  if (activeTempSession && !merged.some(session => session.id === activeTempSession.id)) {
    merged.unshift(activeTempSession);
  }

  if (merged.length > 0) {
    return merged;
  }

  return previousSessions.length > 0 ? previousSessions : [makeEmptySession()];
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useChatSessions(projectId?: string): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [makeEmptySession()]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]!.id);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(!projectId);

  // Ref that always points to the current active session ID.
  // Used by setMessages to avoid stale-closure bugs in async handlers.
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  // Ref that always mirrors the latest sessions array.
  // Allows saveSession to read the current conversationId set by
  // setConversationId without stale closures.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  // Track which sessions have had their messages loaded (avoids re-fetching)
  const loadedSessionIds = useRef(new Set<string>());

  const getActiveSession = useCallback(
    () => sessions.find(s => s.id === activeSessionId) ?? sessions[0]!,
    [sessions, activeSessionId],
  );

  const patchSession = useCallback(
    (id: string, patch: Partial<ChatSession>) => {
      setSessions(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
    },
    [],
  );

  /* -- Reset local session state when the project changes -- */
  useEffect(() => {
    const empty = makeEmptySession();
    loadedSessionIds.current.clear();
    setSessions([empty]);
    setActiveSessionId(empty.id);
    setLoading(false);
    setLoaded(!projectId);
  }, [projectId]);

  /* -- Load session list on demand -- */
  const ensureLoaded = useCallback(async () => {
    if (!projectId || loaded || loading) {
      return;
    }

    setLoading(true);
    try {
      const serverSessions = await listConversations(projectId);
      let nextSessions: ChatSession[] = [];

      setSessions(previousSessions => {
        nextSessions = mergeServerSessions(
          serverSessions,
          previousSessions,
          activeSessionIdRef.current,
        );
        return nextSessions;
      });

      setActiveSessionId(previousActiveSessionId => {
        if (nextSessions.some(session => session.id === previousActiveSessionId)) {
          return previousActiveSessionId;
        }
        return nextSessions[0]!.id;
      });
      setLoaded(true);
    } catch (error) {
      console.error('[easy-sysml] Failed to load chat sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading, projectId]);

  const ensureActiveSession = useCallback(
    async (seedMessages?: ChatMessage[]) => {
      if (!projectId) {
        return null;
      }

      const activeId = activeSessionIdRef.current;
      const currentSession = sessionsRef.current.find(session => session.id === activeId);
      if (!currentSession) {
        return null;
      }

      if (!activeId.startsWith('temp-')) {
        return currentSession;
      }

      const titleSource = seedMessages && seedMessages.length > 0 ? seedMessages : currentSession.messages;
      const created = await createConversation(projectId, {
        title: deriveTitle(titleSource),
      });

      loadedSessionIds.current.add(created.id);
      const nextSession = fromServerSession(created, currentSession.messages);
      setSessions(previousSessions =>
        previousSessions.map(session => (session.id === activeId ? nextSession : session)),
      );
      setActiveSessionId(created.id);
      setLoaded(true);

      return nextSession;
    },
    [projectId],
  );

  /* -- newSession -- */
  const newSession = useCallback(() => {
    const session = makeEmptySession();
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
  }, []);

  /* -- switchSession -- */
  const switchSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);

      if (!projectId) return;
      // Lazily load messages if not yet loaded
      if (loadedSessionIds.current.has(sessionId)) return;
      const session = sessions.find(s => s.id === sessionId);
      if (!session || session.id.startsWith('temp-')) return;

      listConversationMessages(projectId, sessionId)
        .then(messages => {
          loadedSessionIds.current.add(sessionId);
          patchSession(sessionId, { messages: messages.map(fromServerMessage) });
        })
        .catch(error => {
          console.error('[easy-sysml] Failed to load session messages:', error);
        });
    },
    [projectId, sessions, patchSession],
  );

  /* -- deleteSession -- */
  const deleteSession = useCallback(
    (sessionId: string) => {
      setSessions(prev => {
        const updated = prev.filter(s => s.id !== sessionId);
        if (updated.length === 0) {
          const empty = makeEmptySession();
          setActiveSessionId(empty.id);
          return [empty];
        }
        if (activeSessionIdRef.current === sessionId) {
          setActiveSessionId(updated[0]!.id);
        }
        return updated;
      });

      if (projectId && !sessionId.startsWith('temp-')) {
        void deleteConversation(projectId, sessionId).catch(error => {
          console.error('[easy-sysml] Failed to delete chat session:', error);
        });
      }
    },
    [projectId],
  );

  /* -- setMessages (UI state only — no server call) -- */
  const setMessages = useCallback(
    (messages: ChatMessage[]) => {
      // Use the ref to always get the latest active session ID, avoiding
      // stale-closure issues when called from inside long-running async handlers.
      const activeId = activeSessionIdRef.current;
      patchSession(activeId, {
        messages,
        title: deriveTitle(messages),
      });
    },
    [patchSession],
  );

  /* -- saveSession: keep local state in sync after a completed streaming turn -- */
  const saveSession = useCallback(
    (messages: ChatMessage[]) => {
      const activeId = activeSessionIdRef.current;
      patchSession(activeId, {
        messages,
        title: deriveTitle(messages),
      });
    },
    [patchSession],
  );

  /* -- setConversationId -- */
  const setConversationId = useCallback(
    (id: string | null) => {
      const activeId = activeSessionIdRef.current;
      patchSession(activeId, { conversationId: id });
    },
    [patchSession],
  );

  const activeSession = getActiveSession();

  return {
    sessions,
    activeSessionId,
    messages: activeSession?.messages ?? [],
    conversationId: activeSession?.conversationId ?? null,
    loading,
    loaded,
    switchSession,
    ensureLoaded,
    ensureActiveSession,
    newSession,
    deleteSession,
    setMessages,
    setConversationId,
    saveSession,
  };
}
