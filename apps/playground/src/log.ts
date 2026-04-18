/**
 * Debug logger — appends timestamped entries to the log panel.
 */

const logPanel = document.getElementById('log-panel')!;

function appendLog(level: 'info' | 'warn' | 'error' | 'debug', ...args: unknown[]): void {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${level}`;
  const ts = new Date().toISOString().slice(11, 23);
  entry.textContent = `[${ts}] [${level.toUpperCase()}] ${args.map(String).join(' ')}`;
  logPanel.appendChild(entry);
  logPanel.scrollTop = logPanel.scrollHeight;
}

export const log = {
  info: (...args: unknown[]) => { console.info(...args); appendLog('info', ...args); },
  warn: (...args: unknown[]) => { console.warn(...args); appendLog('warn', ...args); },
  error: (...args: unknown[]) => { console.error(...args); appendLog('error', ...args); },
  debug: (...args: unknown[]) => { console.debug(...args); appendLog('debug', ...args); },
};
