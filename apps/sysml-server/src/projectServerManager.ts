import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const MANAGED_HOST = '127.0.0.1';
const DEFAULT_MANAGED_PORT_BASE = 35100;
const DEFAULT_MANAGED_PORT_SPAN = 1500;
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 20_000;
const DEFAULT_HEALTHCHECK_INTERVAL_MS = 250;
const DEFAULT_IDLE_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_SESSIONS = 32;
const DEFAULT_CLAUDE_COMMAND = 'claude';

export interface AgentServerEndpoint {
  baseUrl: string;
  authToken?: string;
  workDir: string;
  managed: boolean;
}

interface ManagedServer {
  projectId: string;
  workDir: string;
  port: number;
  baseUrl: string;
  authToken: string;
  child: ChildProcess;
  startedAt: number;
}

const managedServers = new Map<string, ManagedServer>();
const pendingStarts = new Map<string, Promise<ManagedServer>>();

function shouldManageProjectServers(): boolean {
  const explicit = process.env.SYSML_MANAGE_FORK_SERVERS;
  if (explicit === '1') {
    return true;
  }
  if (explicit === '0') {
    return false;
  }

  // Keep tests stable by defaulting to static endpoint mode unless explicitly enabled.
  if (process.env.NODE_ENV === 'test') {
    return false;
  }

  return true;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getStaticAgentServerUrl(): string {
  return normalizeUrl(process.env.AGENT_SERVER_URL || 'http://localhost:3002');
}

function getManagedPortBase(): number {
  const raw = Number.parseInt(
    process.env.SYSML_AGENT_SERVER_PORT_BASE || process.env.SYSML_FORK_SERVER_PORT_BASE || '',
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MANAGED_PORT_BASE;
}

function getManagedPortSpan(): number {
  const raw = Number.parseInt(
    process.env.SYSML_AGENT_SERVER_PORT_SPAN || process.env.SYSML_FORK_SERVER_PORT_SPAN || '',
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MANAGED_PORT_SPAN;
}

function hashProjectId(projectId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < projectId.length; i++) {
    hash ^= projectId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>(resolve => {
    const tester = createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, MANAGED_HOST);
  });
}

async function selectManagedPort(projectId: string): Promise<number> {
  const base = getManagedPortBase();
  const span = getManagedPortSpan();
  const seed = hashProjectId(projectId) % span;

  for (let offset = 0; offset < span; offset++) {
    const index = (seed + offset) % span;
    const port = base + index;

    const alreadyUsedByManaged = [...managedServers.values()].some(server => server.port === port);
    if (alreadyUsedByManaged) {
      continue;
    }

    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No available ports in managed-project-server range [${base}, ${base + span - 1}]`,
  );
}

function getClaudeCommand(): string {
  return DEFAULT_CLAUDE_COMMAND;
}

function buildManagedAuthToken(projectId: string): string {
  const preset = process.env.AGENT_SERVER_AUTH_TOKEN?.trim();
  if (preset) {
    return preset;
  }
  return `sysml-${projectId.slice(0, 8)}-${randomBytes(6).toString('hex')}`;
}

function isChildAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

async function isServerHealthy(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealthyServer(
  baseUrl: string,
  child: ChildProcess,
  timeoutMs = DEFAULT_HEALTHCHECK_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isChildAlive(child)) {
      throw new Error(`Managed agent server exited before becoming healthy (${baseUrl})`);
    }

    if (await isServerHealthy(baseUrl)) {
      return;
    }

    await delay(DEFAULT_HEALTHCHECK_INTERVAL_MS);
  }

  throw new Error(`Managed agent server did not become healthy in ${timeoutMs}ms (${baseUrl})`);
}

async function terminateManagedServer(server: ManagedServer): Promise<void> {
  if (!isChildAlive(server.child)) {
    return;
  }

  const child = server.child;
  const exited = new Promise<void>(resolve => {
    child.once('exit', () => resolve());
  });

  child.kill();

  const killDeadline = delay(3_000).then(() => {
    if (isChildAlive(child)) {
      child.kill('SIGKILL');
    }
  });

  await Promise.race([exited, killDeadline]);
}

async function startManagedServer(projectId: string, workDir: string): Promise<ManagedServer> {
  const port = await selectManagedPort(projectId);
  const authToken = buildManagedAuthToken(projectId);
  const baseUrl = `http://${MANAGED_HOST}:${port}`;
  let lastStderr = '';

  const args = [
    'server',
    '--host',
    MANAGED_HOST,
    '--port',
    String(port),
    '--workspace',
    workDir,
    '--idle-timeout',
    String(DEFAULT_IDLE_TIMEOUT_MS),
    '--max-sessions',
    String(DEFAULT_MAX_SESSIONS),
    '--auth-token',
    authToken,
  ];

  const child = spawn(getClaudeCommand(), args, {
    cwd: workDir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: process.platform === 'win32',
  });

  const spawnFailure = new Promise<never>((_resolve, reject) => {
    child.once('error', error => {
      reject(
        new Error(
          `Failed to launch managed agent server with the global \`claude\` command. Ensure \`claude\` is installed and available on PATH. ${error.message}`,
        ),
      );
    });
  });

  child.stdout?.on('data', chunk => {
    const text = chunk.toString().trim();
    if (text) {
      console.log(`[sysml-server][managed-agent-server:${projectId}] ${text}`);
    }
  });

  child.stderr?.on('data', chunk => {
    const text = chunk.toString().trim();
    if (text) {
      lastStderr = text;
      console.warn(`[sysml-server][managed-agent-server:${projectId}:stderr] ${text}`);
    }
  });

  const server: ManagedServer = {
    projectId,
    workDir,
    port,
    baseUrl,
    authToken,
    child,
    startedAt: Date.now(),
  };

  child.once('exit', () => {
    const current = managedServers.get(projectId);
    if (current?.child === child) {
      managedServers.delete(projectId);
    }
  });

  try {
    await Promise.race([waitForHealthyServer(baseUrl, child), spawnFailure]);
    return server;
  } catch (error) {
    await terminateManagedServer(server);

    if (error instanceof Error && /becoming healthy/.test(error.message)) {
      const suffix = lastStderr ? ` Last stderr: ${lastStderr}` : '';
      throw new Error(
        `Failed to start managed agent server with the global \`claude\` command. Ensure \`claude\` is installed and available on PATH.${suffix}`,
      );
    }

    throw error;
  }
}

async function ensureManagedServer(projectId: string, workDir: string): Promise<ManagedServer> {
  const existing = managedServers.get(projectId);
  if (existing) {
    const needsRestart = existing.workDir !== workDir || !(await isServerHealthy(existing.baseUrl));
    if (!needsRestart) {
      return existing;
    }

    managedServers.delete(projectId);
    await terminateManagedServer(existing);
  }

  const pending = pendingStarts.get(projectId);
  if (pending) {
    return await pending;
  }

  const startup = startManagedServer(projectId, workDir)
    .then(server => {
      managedServers.set(projectId, server);
      return server;
    })
    .finally(() => {
      pendingStarts.delete(projectId);
    });

  pendingStarts.set(projectId, startup);
  return await startup;
}

export function buildAgentServerHeaders(
  authToken?: string,
  includeJsonContentType = false,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  return headers;
}

export function getStaticAgentServerEndpoint(workDir: string): AgentServerEndpoint {
  return {
    baseUrl: getStaticAgentServerUrl(),
    authToken: process.env.AGENT_SERVER_AUTH_TOKEN,
    workDir,
    managed: false,
  };
}

export async function getProjectAgentServerEndpoint(
  projectId: string,
  workDir: string,
): Promise<AgentServerEndpoint> {
  if (!shouldManageProjectServers()) {
    return getStaticAgentServerEndpoint(workDir);
  }

  const server = await ensureManagedServer(projectId, workDir);
  return {
    baseUrl: server.baseUrl,
    authToken: server.authToken,
    workDir: server.workDir,
    managed: true,
  };
}

export async function shutdownManagedProjectServers(): Promise<void> {
  const servers = [...managedServers.values()];
  managedServers.clear();

  await Promise.all(
    servers.map(async server => {
      try {
        await terminateManagedServer(server);
      } catch (error) {
        console.warn(
          `[sysml-server] Failed to stop managed agent server for project ${server.projectId}:`,
          error,
        );
      }
    }),
  );
}
