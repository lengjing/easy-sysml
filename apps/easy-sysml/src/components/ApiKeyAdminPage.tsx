import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Copy,
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  createAiApiKey,
  getAdminSession,
  listAiApiKeys,
  loginAdminSession,
  rechargeAiApiKey,
  logoutAdminSession,
  revokeAiApiKey,
  type ServerAiApiKeyRecord,
} from '../lib/sysml-server';

const ADMIN_SESSION_STORAGE_KEY = 'easy-sysml-admin-session';
const DISPLAY_FONT = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
const BODY_FONT = '"Aptos", "Segoe UI Variable Text", "Segoe UI", sans-serif';

function loadStoredSessionToken(): string {
  try {
    return localStorage.getItem(ADMIN_SESSION_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function persistSessionToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatMoney(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatTime(value: number | null): string {
  if (!value) {
    return '尚未使用';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatCostPerThousandTokens(costUsd: number, tokenCount: number): string {
  if (tokenCount <= 0) {
    return '暂无数据';
  }

  return `${formatMoney((costUsd * 1000) / tokenCount)}/1K`;
}

function formatRemainingBalance(key: ServerAiApiKeyRecord): string {
  if (key.balance_usd === null) {
    return '不限额';
  }

  return formatMoney(Math.max(0, key.balance_usd - key.total_cost_usd));
}

function getKeyState(key: ServerAiApiKeyRecord): { label: string; tone: string } {
  if (key.revoked_at) {
    return {
      label: '已吊销',
      tone: 'border-[#102033]/10 bg-[#f1eee7] text-[#6c7380]',
    };
  }

  if (key.balance_usd !== null && key.total_cost_usd >= key.balance_usd) {
    return {
      label: '需充值',
      tone: 'border-[#b1361f]/18 bg-[#fff1eb] text-[#9a301d]',
    };
  }

  return {
    label: 'Active',
    tone: 'border-[#143858]/16 bg-[#edf4fb] text-[#143858]',
  };
}

const FrameCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ className, children }) => (
  <div
    className={[
      'relative overflow-hidden rounded-[28px] border border-[#102033]/12 bg-white/72 shadow-[0_20px_60px_rgba(16,32,51,0.12)] backdrop-blur-sm',
      className,
    ].filter(Boolean).join(' ')}
  >
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0.18))]" />
    <div className="relative">{children}</div>
  </div>
);

const StatTile: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <FrameCard className="p-5">
    <div className="text-[11px] uppercase tracking-[0.25em] text-[#6c7380]">{label}</div>
    <div className="mt-4 flex items-end justify-between gap-4">
      <div className="text-3xl font-semibold text-[#102033]">{value}</div>
      <div className="h-12 w-12 rounded-full border border-[#102033]/10" style={{ background: accent }} />
    </div>
  </FrameCard>
);

const MetricTag: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-[#102033]/10 bg-[#fffdf7] px-3 py-3">
    <div className="text-[10px] uppercase tracking-[0.22em] text-[#7d6e64]">{label}</div>
    <div className="mt-1 text-sm font-semibold text-[#102033]">{value}</div>
  </div>
);

export const ApiKeyAdminPage: React.FC = () => {
  const [sessionToken, setSessionToken] = useState(loadStoredSessionToken);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyBalance, setNewKeyBalance] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [apiKeys, setApiKeys] = useState<ServerAiApiKeyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [rechargeDrafts, setRechargeDrafts] = useState<Record<string, string>>({});

  const orderedKeys = useMemo(
    () => [...apiKeys].sort((left, right) => Number(Boolean(left.revoked_at)) - Number(Boolean(right.revoked_at)) || right.created_at - left.created_at),
    [apiKeys],
  );

  const activeKeyCount = useMemo(
    () => apiKeys.filter(item => !item.revoked_at).length,
    [apiKeys],
  );

  const revokedKeyCount = useMemo(
    () => apiKeys.filter(item => item.revoked_at).length,
    [apiKeys],
  );

  const totalRequests = useMemo(
    () => apiKeys.reduce((sum, item) => sum + item.total_requests, 0),
    [apiKeys],
  );

  const totalInputTokens = useMemo(
    () => apiKeys.reduce((sum, item) => sum + item.total_input_tokens, 0),
    [apiKeys],
  );

  const totalOutputTokens = useMemo(
    () => apiKeys.reduce((sum, item) => sum + item.total_output_tokens, 0),
    [apiKeys],
  );

  const totalCacheTokens = useMemo(
    () => apiKeys.reduce((sum, item) => sum + item.total_cache_creation_input_tokens + item.total_cache_read_input_tokens, 0),
    [apiKeys],
  );

  const totalTokens = useMemo(
    () => totalInputTokens + totalOutputTokens + totalCacheTokens,
    [totalCacheTokens, totalInputTokens, totalOutputTokens],
  );

  const totalCost = useMemo(
    () => apiKeys.reduce((sum, item) => sum + item.total_cost_usd, 0),
    [apiKeys],
  );

  const refreshKeys = useCallback(async (token: string) => {
    setLoadingKeys(true);
    try {
      const records = await listAiApiKeys(token);
      setApiKeys(records);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '加载 API key 失败');
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      setSessionChecked(true);
      setAuthenticated(false);
      return;
    }

    let active = true;
    void getAdminSession(sessionToken)
      .then(session => {
        if (!active) {
          return;
        }

        if (!session.authenticated) {
          persistSessionToken('');
          setSessionToken('');
          setAuthenticated(false);
          setSessionChecked(true);
          return;
        }

        setAuthenticated(true);
        setUsername(session.username || 'admin');
        setSessionChecked(true);
        void refreshKeys(sessionToken);
      })
      .catch(nextError => {
        if (!active) {
          return;
        }

        persistSessionToken('');
        setSessionToken('');
        setAuthenticated(false);
        setSessionChecked(true);
        setError(nextError instanceof Error ? nextError.message : '管理员会话校验失败');
      });

    return () => {
      active = false;
    };
  }, [refreshKeys, sessionToken]);

  const handleLogin = useCallback(async () => {
    setLoginBusy(true);
    try {
      const session = await loginAdminSession(username.trim(), password.trim());
      persistSessionToken(session.session_token);
      setSessionToken(session.session_token);
      setAuthenticated(true);
      setSessionChecked(true);
      setPassword('');
      setError(null);
      await refreshKeys(session.session_token);
    } catch (nextError) {
      setAuthenticated(false);
      setError(nextError instanceof Error ? nextError.message : '管理员登录失败');
    } finally {
      setLoginBusy(false);
    }
  }, [password, refreshKeys, username]);

  const handleLogout = useCallback(async () => {
    try {
      if (sessionToken) {
        await logoutAdminSession(sessionToken);
      }
    } catch {
      // ignore logout failures and clear local state regardless
    } finally {
      persistSessionToken('');
      setSessionToken('');
      setAuthenticated(false);
      setApiKeys([]);
      setGeneratedApiKey(null);
      setCopyFeedback(null);
      setPassword('');
    }
  }, [sessionToken]);

  const handleCreateKey = useCallback(async () => {
    if (!sessionToken) {
      return;
    }

    const parsedBalance = newKeyBalance.trim() ? Number(newKeyBalance) : null;
    if (parsedBalance !== null && (!Number.isFinite(parsedBalance) || parsedBalance < 0)) {
      setError('初始余额必须是大于等于 0 的数字');
      return;
    }

    setLoadingKeys(true);
    try {
      const created = await createAiApiKey(sessionToken, newKeyName.trim() || undefined, parsedBalance);
      setGeneratedApiKey(created.api_key);
      setNewKeyName('');
      setNewKeyBalance('');
      setCopyFeedback(null);
      setError(null);
      await refreshKeys(sessionToken);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '创建 API key 失败');
    } finally {
      setLoadingKeys(false);
    }
  }, [newKeyBalance, newKeyName, refreshKeys, sessionToken]);

  const handleRevokeKey = useCallback(async (id: string) => {
    if (!sessionToken) {
      return;
    }

    setLoadingKeys(true);
    try {
      await revokeAiApiKey(sessionToken, id);
      await refreshKeys(sessionToken);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '吊销 API key 失败');
    } finally {
      setLoadingKeys(false);
    }
  }, [refreshKeys, sessionToken]);

  const handleRechargeKey = useCallback(async (id: string) => {
    if (!sessionToken) {
      return;
    }

    const rawAmount = rechargeDrafts[id]?.trim() ?? '';
    const amount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(amount) || amount <= 0) {
      setError('充值金额必须是大于 0 的数字');
      return;
    }

    setLoadingKeys(true);
    try {
      await rechargeAiApiKey(sessionToken, id, amount);
      setRechargeDrafts(prev => ({ ...prev, [id]: '' }));
      setError(null);
      await refreshKeys(sessionToken);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '充值失败');
    } finally {
      setLoadingKeys(false);
    }
  }, [rechargeDrafts, refreshKeys, sessionToken]);

  const handleCopyKey = useCallback(async () => {
    if (!generatedApiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedApiKey);
      setCopyFeedback('已复制到剪贴板');
    } catch {
      setCopyFeedback('复制失败，请手动复制');
    }
  }, [generatedApiKey]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f2e7d4] text-[#102033]" style={{ fontFamily: BODY_FONT }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(177,54,31,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(20,56,88,0.18),transparent_30%),linear-gradient(180deg,rgba(255,252,246,0.78),rgba(242,231,212,0.96))]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(16,32,51,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(16,32,51,0.08)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#b1361f]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-12 h-80 w-80 rounded-full bg-[#143858]/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <motion.header
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="mb-8 flex flex-col gap-4 rounded-[32px] border border-[#102033]/10 bg-white/60 px-5 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#102033]/10 bg-[#102033] text-[#f8f2e7] shadow-[0_12px_30px_rgba(16,32,51,0.18)]">
              <Fingerprint size={22} />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.34em] text-[#7d6e64]">Easy SysML</div>
              <div className="text-lg font-semibold text-[#102033]">Admin Key Registry</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-[#5f6774]">
            <div className="rounded-full border border-[#102033]/10 bg-[#fff8ee] px-4 py-2">URL: /admin/api-keys</div>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-[#102033]/10 bg-white px-4 py-2 font-medium text-[#102033] transition-transform hover:-translate-y-0.5"
            >
              <ArrowLeft size={16} />
              返回工作台
            </a>
          </div>
        </motion.header>

        {!sessionChecked ? (
          <div className="flex flex-1 items-center justify-center">
            <FrameCard className="px-8 py-10">
              <div className="flex items-center gap-3 text-[#102033]">
                <Loader2 size={20} className="animate-spin" />
                正在校验管理员会话...
              </div>
            </FrameCard>
          </div>
        ) : !authenticated ? (
          <div className="grid flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              className="relative overflow-hidden rounded-[36px] border border-[#102033]/12 bg-[#102033] px-6 py-8 text-[#f8f2e7] shadow-[0_24px_80px_rgba(16,32,51,0.24)] sm:px-8 lg:px-10"
            >
              <div className="pointer-events-none absolute -right-12 top-10 rotate-6 rounded-full border border-white/10 px-6 py-2 text-[11px] uppercase tracking-[0.34em] text-white/40">
                Authorized Eyes Only
              </div>
              <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[#b1361f]/20 blur-3xl" />

              <div className="relative max-w-2xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/70">
                  <ShieldCheck size={14} />
                  独立管理地址
                </div>
                <h1 className="max-w-xl text-5xl leading-none sm:text-6xl" style={{ fontFamily: DISPLAY_FONT }}>
                  API Key Registry
                </h1>
                <p className="mt-5 max-w-lg text-base leading-7 text-[#d7d0c3]">
                  这是一个脱离建模工作台的独立管理入口。所有 AI key 的签发、统计和吊销，都在这个单独 URL 中完成，不再混入普通用户的建模界面。
                </p>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  <FrameCard className="border-white/10 bg-white/8 p-5 text-[#f8f2e7] shadow-none">
                    <div className="text-[10px] uppercase tracking-[0.26em] text-white/50">Session Gate</div>
                    <div className="mt-2 text-xl" style={{ fontFamily: DISPLAY_FONT }}>Admin credentials required</div>
                    <div className="mt-3 text-sm leading-6 text-white/72">后端会在所有 `/api/ai/keys` 请求前检查管理员会话，没有会话直接返回 `401`。</div>
                  </FrameCard>
                  <FrameCard className="border-white/10 bg-[#f8f2e7] p-5 text-[#102033] shadow-none">
                    <div className="text-[10px] uppercase tracking-[0.26em] text-[#7d6e64]">Route</div>
                    <div className="mt-2 text-xl break-all" style={{ fontFamily: DISPLAY_FONT }}>/admin/api-keys</div>
                    <div className="mt-3 text-sm leading-6 text-[#4b5563]">这个页面可以直接收藏为后台入口，也可以单独部署在有 SPA fallback 的环境中。</div>
                  </FrameCard>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.1, ease: 'easeOut' }}
              className="flex"
            >
              <FrameCard className="flex w-full flex-col justify-between p-6 sm:p-8">
                <div>
                  <div className="mb-6 text-[11px] uppercase tracking-[0.28em] text-[#7d6e64]">Administrator Login</div>
                  <div className="text-4xl text-[#102033]" style={{ fontFamily: DISPLAY_FONT }}>签发室入口</div>
                  <p className="mt-4 max-w-md text-sm leading-7 text-[#5f6774]">
                    登录后才能查看现有 key、生成新 key、吊销旧 key，并检查请求数、token 和成本消耗。
                  </p>
                </div>

                <div className="mt-8 space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-[#7d6e64]">用户名</span>
                    <input
                      value={username}
                      onChange={event => setUsername(event.target.value)}
                      className="w-full rounded-2xl border border-[#102033]/12 bg-[#fffaf2] px-4 py-3 text-base text-[#102033] outline-none transition-colors focus:border-[#143858]/40"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-[#7d6e64]">密码</span>
                    <input
                      type="password"
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-[#102033]/12 bg-[#fffaf2] px-4 py-3 text-base text-[#102033] outline-none transition-colors focus:border-[#143858]/40"
                    />
                  </label>

                  {error && (
                    <div className="rounded-2xl border border-[#b1361f]/20 bg-[#b1361f]/8 px-4 py-3 text-sm text-[#9a301d]">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={() => void handleLogin()}
                    disabled={loginBusy || !username.trim() || !password.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#b1361f] px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#9a301d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loginBusy ? <Loader2 size={16} className="animate-spin" /> : <UserRound size={16} />}
                    进入管理页
                  </button>
                </div>
              </FrameCard>
            </motion.section>
          </div>
        ) : (
          <div className="grid flex-1 gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="space-y-6"
            >
              <FrameCard className="overflow-hidden bg-[#102033] p-6 text-[#f8f2e7] sm:p-7">
                <div className="pointer-events-none absolute inset-y-0 right-0 w-28 border-l border-white/8 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.08),transparent)]" />
                <div className="relative">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/70">
                    <KeyRound size={14} />
                    Registry Console
                  </div>
                  <h2 className="text-4xl leading-tight" style={{ fontFamily: DISPLAY_FONT }}>签发、追踪、收回</h2>
                  <p className="mt-4 max-w-md text-sm leading-7 text-[#d7d0c3]">
                    你当前正在独立管理 URL 中操作，普通建模用户只能输入分配给他们的 key，不能从工作台中直接管理 key。
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-white/50">管理员</div>
                      <div className="mt-2 text-lg font-semibold">{username}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-4">
                      <div className="text-[10px] uppercase tracking-[0.24em] text-white/50">状态</div>
                      <div className="mt-2 text-lg font-semibold">Session active</div>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap gap-3">
                    <button
                      onClick={() => void refreshKeys(sessionToken)}
                      disabled={loadingKeys}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/16 disabled:opacity-60"
                    >
                      <RefreshCw size={15} className={loadingKeys ? 'animate-spin' : ''} />
                      刷新列表
                    </button>
                    <button
                      onClick={() => void handleLogout()}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-transparent px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/8"
                    >
                      <LogOut size={15} />
                      退出登录
                    </button>
                  </div>
                </div>
              </FrameCard>

              <div className="grid gap-4 sm:grid-cols-2">
                <StatTile label="Active keys" value={formatInteger(activeKeyCount)} accent="radial-gradient(circle, rgba(177,54,31,0.18), rgba(177,54,31,0.02))" />
                <StatTile label="Revoked keys" value={formatInteger(revokedKeyCount)} accent="radial-gradient(circle, rgba(16,32,51,0.14), rgba(16,32,51,0.02))" />
                <StatTile label="Total requests" value={formatInteger(totalRequests)} accent="radial-gradient(circle, rgba(20,56,88,0.18), rgba(20,56,88,0.02))" />
                <StatTile label="Input tokens" value={formatInteger(totalInputTokens)} accent="radial-gradient(circle, rgba(212,154,83,0.22), rgba(212,154,83,0.02))" />
                <StatTile label="Output tokens" value={formatInteger(totalOutputTokens)} accent="radial-gradient(circle, rgba(83,151,212,0.22), rgba(83,151,212,0.02))" />
                <StatTile label="Cache tokens" value={formatInteger(totalCacheTokens)} accent="radial-gradient(circle, rgba(89,83,212,0.18), rgba(89,83,212,0.02))" />
                <StatTile label="Effective rate" value={formatCostPerThousandTokens(totalCost, totalTokens)} accent="radial-gradient(circle, rgba(30,110,70,0.18), rgba(30,110,70,0.02))" />
              </div>

              <FrameCard className="px-5 py-4 text-sm leading-7 text-[#5f6774]">
                当前费用比率按“累计费用 / 全部累计 tokens”计算，为综合有效单价。因为不同模型、输入/输出、缓存读写的单价可能不同，所以这里展示的是实际混合均价，而不是固定官方单价。
              </FrameCard>

              <FrameCard className="p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-[#7d6e64]">Issue a new key</div>
                    <div className="mt-2 text-3xl text-[#102033]" style={{ fontFamily: DISPLAY_FONT }}>新的签发条目</div>
                  </div>
                  <div className="rounded-full border border-[#102033]/10 bg-[#fff8ee] px-3 py-1 text-xs text-[#5f6774]">总费用 {formatMoney(totalCost)}</div>
                </div>

                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-[#7d6e64]">Key 名称</span>
                    <input
                      value={newKeyName}
                      onChange={event => setNewKeyName(event.target.value)}
                      placeholder="例如：建模团队 / 第三组 / 试验环境"
                      className="w-full rounded-2xl border border-[#102033]/12 bg-[#fffaf2] px-4 py-3 text-base text-[#102033] outline-none transition-colors focus:border-[#143858]/40"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-[#7d6e64]">初始余额 USD</span>
                    <input
                      value={newKeyBalance}
                      onChange={event => setNewKeyBalance(event.target.value)}
                      placeholder="留空表示不限额，例如 10"
                      inputMode="decimal"
                      className="w-full rounded-2xl border border-[#102033]/12 bg-[#fffaf2] px-4 py-3 text-base text-[#102033] outline-none transition-colors focus:border-[#143858]/40"
                    />
                  </label>

                  <button
                    onClick={() => void handleCreateKey()}
                    disabled={loadingKeys}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#b1361f] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#9a301d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingKeys ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                    签发新 Key
                  </button>
                </div>
              </FrameCard>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08, ease: 'easeOut' }}
              className="space-y-6"
            >
              {generatedApiKey && (
                <FrameCard className="border-[#b1361f]/15 bg-[#fffaf2] p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.26em] text-[#9a301d]">Freshly issued</div>
                      <div className="mt-2 text-3xl text-[#102033]" style={{ fontFamily: DISPLAY_FONT }}>请立即保存新 key</div>
                      <div className="mt-3 break-all rounded-2xl border border-[#102033]/10 bg-white px-4 py-3 text-sm text-[#102033] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        {generatedApiKey}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => void handleCopyKey()}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#102033]/12 bg-white px-4 py-2 text-sm font-medium text-[#102033] transition-transform hover:-translate-y-0.5"
                      >
                        <Copy size={15} />
                        复制 key
                      </button>
                      {copyFeedback && <div className="text-sm text-[#7d6e64]">{copyFeedback}</div>}
                    </div>
                  </div>
                </FrameCard>
              )}

              {error && (
                <FrameCard className="border-[#b1361f]/15 bg-[#fff4f1] px-5 py-4 text-[#9a301d]">
                  {error}
                </FrameCard>
              )}

              <FrameCard className="p-6 sm:p-7">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.26em] text-[#7d6e64]">Inventory</div>
                    <div className="mt-2 text-4xl text-[#102033]" style={{ fontFamily: DISPLAY_FONT }}>Key Ledger</div>
                    <p className="mt-3 max-w-xl text-sm leading-7 text-[#5f6774]">
                      每个条目都记录了请求数、token 消耗和费用。活跃 key 排在前面，已吊销 key 保留在账册中以便审计。
                    </p>
                  </div>
                  <div className="rounded-full border border-[#102033]/10 bg-[#fff8ee] px-4 py-2 text-sm text-[#5f6774]">共 {formatInteger(apiKeys.length)} 条记录</div>
                </div>

                <div className="space-y-4">
                  {orderedKeys.length === 0 && !loadingKeys ? (
                    <div className="rounded-[24px] border border-dashed border-[#102033]/14 bg-[#fffaf2] px-5 py-10 text-center text-sm text-[#6c7380]">
                      当前还没有可管理的 API key。
                    </div>
                  ) : (
                    orderedKeys.map((key, index) => (
                      <motion.article
                        key={key.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.42, delay: 0.04 * index, ease: 'easeOut' }}
                        className="relative overflow-hidden rounded-[28px] border border-[#102033]/10 bg-[#fffdf7] p-5 shadow-[0_10px_24px_rgba(16,32,51,0.06)]"
                      >
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="max-w-xl">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-[11px] uppercase tracking-[0.26em] text-[#7d6e64]">{key.key_prefix}...</div>
                              <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.24em] ${getKeyState(key).tone}`}>
                                {getKeyState(key).label}
                              </span>
                            </div>
                            <h3 className="mt-2 text-3xl text-[#102033]" style={{ fontFamily: DISPLAY_FONT }}>{key.name}</h3>
                            <div className="mt-4 grid gap-2 text-sm text-[#5f6774] sm:grid-cols-2">
                              <div>创建时间：{formatTime(key.created_at)}</div>
                              <div>最近使用：{formatTime(key.last_used_at)}</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            {!key.revoked_at && (
                              <button
                                onClick={() => void handleRevokeKey(key.id)}
                                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#b1361f]/18 bg-[#fff1eb] px-4 py-2 text-sm font-medium text-[#9a301d] transition-transform hover:-translate-y-0.5"
                              >
                                <Trash2 size={15} />
                                吊销 Key
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 md:grid-cols-3">
                          <MetricTag label="请求数" value={formatInteger(key.total_requests)} />
                          <MetricTag label="输入 Tokens" value={formatInteger(key.total_input_tokens)} />
                          <MetricTag label="输出 Tokens" value={formatInteger(key.total_output_tokens)} />
                          <MetricTag label="缓存写入" value={formatInteger(key.total_cache_creation_input_tokens)} />
                          <MetricTag label="缓存读取" value={formatInteger(key.total_cache_read_input_tokens)} />
                          <MetricTag label="累计费用" value={formatMoney(key.total_cost_usd)} />
                          <MetricTag label="综合单价" value={formatCostPerThousandTokens(key.total_cost_usd, key.total_input_tokens + key.total_output_tokens + key.total_cache_creation_input_tokens + key.total_cache_read_input_tokens)} />
                          <MetricTag label="已充值总额" value={key.balance_usd === null ? '不限额' : formatMoney(key.balance_usd)} />
                          <MetricTag label="剩余可用" value={formatRemainingBalance(key)} />
                        </div>

                        {!key.revoked_at && (
                          <div className="mt-5 flex flex-col gap-3 rounded-[22px] border border-[#102033]/10 bg-white/70 p-4 sm:flex-row sm:items-end">
                            <label className="block flex-1">
                              <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-[#7d6e64]">充值 USD</span>
                              <input
                                value={rechargeDrafts[key.id] ?? ''}
                                onChange={event => setRechargeDrafts(prev => ({ ...prev, [key.id]: event.target.value }))}
                                placeholder="例如 5"
                                inputMode="decimal"
                                className="w-full rounded-2xl border border-[#102033]/12 bg-[#fffaf2] px-4 py-3 text-base text-[#102033] outline-none transition-colors focus:border-[#143858]/40"
                              />
                            </label>
                            <button
                              onClick={() => void handleRechargeKey(key.id)}
                              disabled={loadingKeys}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#143858] px-5 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#102c45] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {loadingKeys ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                              充值后恢复使用
                            </button>
                          </div>
                        )}
                      </motion.article>
                    ))
                  )}
                </div>
              </FrameCard>
            </motion.section>
          </div>
        )}
      </div>
    </div>
  );
};
