/**
 * Hook: useChatSessions
 *
 * Manages chat UI sessions backed by the sysml-server backend.
 *
 * When a `projectId` is provided, sessions are loaded from and persisted to
 * the server (`/api/projects/:projectId/chat-sessions`). Without a project,
 * sessions fall back to an in-memory store that is not persisted.
 *
 * Sessions hold the full message history (serialised as JSON on the server).
 * Only the session list is fetched eagerly; individual session messages are
 * loaded lazily when a session is switched to.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  saveChatSessionMessages,
  updateChatSession,
  type ServerChatSession,
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
  /** True while the initial session list is loading from the server */
  loading: boolean;

  /** Switch to an existing session (loads messages if not already loaded) */
  switchSession: (sessionId: string) => void;
  /** Create a new empty session and make it active */
  newSession: () => void;
  /** Delete a session */
  deleteSession: (sessionId: string) => void;
  /** Update messages in the active session (call after a completed turn) */
  setMessages: (messages: ChatMessage[]) => void;
  /** Update the conversationId of the active session */
  setConversationId: (id: string | null) => void;
  /** Persist the active session's current state to the server */
  flush: () => void;
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

function fromServerSession(s: ServerChatSession, messages?: ChatMessage[]): ChatSession {
  return {
    id: s.id,
    title: s.title,
    messages: messages ?? (s.messages as ChatMessage[] | undefined) ?? [],
    conversationId: s.conversation_id,
    createdAt: s.created_at,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useChatSessions(projectId?: string): UseChatSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [makeEmptySession()]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => sessions[0]!.id);
  const [loading, setLoading] = useState(false);

  // Ref that always points to the current active session ID.
  // Used by setMessages to avoid stale-closure bugs in async handlers.
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  // Track which sessions have had their messages loaded (avoids re-fetching)
  const loadedSessionIds = useRef(new Set<string>());
  // Debounce timer for flushing to server
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  /* -- Load session list from server on mount / project change -- */
  useEffect(() => {
    if (!projectId) return;

    let mounted = true;
    setLoading(true);
    loadedSessionIds.current.clear();

    listChatSessions(projectId)
      .then(serverSessions => {
        if (!mounted) return;
        if (serverSessions.length === 0) {
          const empty = makeEmptySession();
          setSessions([empty]);
          setActiveSessionId(empty.id);
          return;
        }

        const mapped = serverSessions.map(s => fromServerSession(s));
        setSessions(mapped);
        setActiveSessionId(mapped[0]!.id);
      })
      .catch(error => {
        console.error('[easy-sysml] Failed to load chat sessions:', error);
        if (!mounted) return;
        const empty = makeEmptySession();
        setSessions([empty]);
        setActiveSessionId(empty.id);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [projectId]);

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

      getChatSession(projectId, sessionId)
        .then(full => {
          loadedSessionIds.current.add(sessionId);
          patchSession(sessionId, { messages: (full.messages as ChatMessage[]) ?? [] });
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
        return updated;
      });

      setActiveSessionId(prev => {
        if (prev !== sessionId) return prev;
        const remaining = sessions.filter(s => s.id !== sessionId);
        return remaining.length > 0 ? remaining[0]!.id : makeTempId();
      });

      if (projectId && !sessionId.startsWith('temp-')) {
        void deleteChatSession(projectId, sessionId).catch(error => {
          console.error('[easy-sysml] Failed to delete chat session:', error);
        });
      }
    },
    [projectId, sessions],
  );

  /* -- setMessages -- */
  const setMessages = useCallback(
    (messages: ChatMessage[]) => {
      // Use the ref to always get the latest active session ID, avoiding
      // stale-closure issues when called from inside long-running async handlers.
      const activeId = activeSessionIdRef.current;
      patchSession(activeId, {
        messages,
        title: deriveTitle(messages),
      });

      // Persist to server after a short debounce
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        if (!projectId) return;

        // Re-read the active ID at debounce time (may have advanced if promoted
        // from temp to a real server ID between the call and the flush).
        const currentActiveId = activeSessionIdRef.current;
        const isTemp = currentActiveId.startsWith('temp-');

        if (isTemp) {
          if (messages.length === 0) {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('[easy-sysml] setMessages([]) called for a temp session — skipping create.');
            }
            return;
          }
          // Create new server session
          void createChatSession(projectId, {
            title: deriveTitle(messages),
            messages,
          })
            .then(created => {
              loadedSessionIds.current.add(created.id);
              setSessions(prev =>
                prev.map(s =>
                  s.id === currentActiveId
                    ? fromServerSession(created, messages)
                    : s,
                ),
              );
              setActiveSessionId(created.id);
            })
            .catch(error => {
              console.error('[easy-sysml] Failed to create chat session:', error);
            });
        } else {
          // Update existing session — always send title to keep it in sync
          void Promise.all([
            saveChatSessionMessages(projectId, currentActiveId, messages),
            updateChatSession(projectId, currentActiveId, { title: deriveTitle(messages) }),
          ]).catch(error => {
            console.error('[easy-sysml] Failed to save chat session:', error);
          });
        }
      }, 800);
    },
    // Intentionally excludes activeSessionId and sessions — the ref keeps the
    // active ID current without requiring the callback to be recreated on every
    // render, which would cause stale captures inside async event handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchSession, projectId],
  );

  /* -- setConversationId -- */
  const setConversationId = useCallback(
    (id: string | null) => {
      const activeId = activeSessionId;
      patchSession(activeId, { conversationId: id });

      if (!projectId || activeId.startsWith('temp-')) return;
      void updateChatSession(projectId, activeId, { conversation_id: id }).catch(error => {
        console.error('[easy-sysml] Failed to update conversation ID:', error);
      });
    },
    [activeSessionId, patchSession, projectId],
  );

  /* -- flush -- */
  const flush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const session = getActiveSession();
    if (!projectId || !session) return;

    const isTemp = session.id.startsWith('temp-');
    if (isTemp && session.messages.length > 0) {
      void createChatSession(projectId, {
        title: session.title,
        messages: session.messages,
        conversation_id: session.conversationId,
      })
        .then(created => {
          loadedSessionIds.current.add(created.id);
          setSessions(prev =>
            prev.map(s =>
              s.id === session.id
                ? fromServerSession(created, session.messages)
                : s,
            ),
          );
          setActiveSessionId(created.id);
        })
        .catch(error => {
          console.error('[easy-sysml] Failed to flush chat session:', error);
        });
    } else if (!isTemp) {
      void saveChatSessionMessages(projectId, session.id, session.messages).catch(error => {
        console.error('[easy-sysml] Failed to flush chat messages:', error);
      });
    }
  }, [getActiveSession, projectId]);

  const activeSession = getActiveSession();

  return {
    sessions,
    activeSessionId,
    messages: activeSession?.messages ?? [],
    conversationId: activeSession?.conversationId ?? null,
    loading,
    switchSession,
    newSession,
    deleteSession,
    setMessages,
    setConversationId,
    flush,
  };
}
