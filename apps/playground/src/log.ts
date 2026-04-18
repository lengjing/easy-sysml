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

function makeLogger(level: 'info' | 'warn' | 'error' | 'debug') {
  return (...args: unknown[]) => { console[level](...args); appendLog(level, ...args); };
}

export const log = {
  info: makeLogger('info'),
  warn: makeLogger('warn'),
  error: makeLogger('error'),
  debug: makeLogger('debug'),
};
