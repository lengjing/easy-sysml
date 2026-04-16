/**
 * VSCode extension entry point for Easy SysML.
 *
 * Connects to the SysML v2 language server via LSP and provides
 * commands for restart and the AI chat panel.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js';

let client: LanguageClient | undefined;

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel(
    'SysML v2 Language Server',
  );
  outputChannel.appendLine('Activating Easy SysML extension…');

  // --- Language Server ---------------------------------------------------

  const serverModule = context.asAbsolutePath(
    path.join('..', '..', 'packages', 'language-server', 'dist', 'main.js'),
  );

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'sysml' },
      { scheme: 'file', language: 'kerml' },
    ],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher(
        '**/*.{sysml,kerml}',
      ),
    },
    outputChannel,
  };

  client = new LanguageClient(
    'easySysml',
    'SysML v2 Language Server',
    serverOptions,
    clientOptions,
  );

  await client.start();
  outputChannel.appendLine('Language server started.');

  // --- Commands ----------------------------------------------------------

  context.subscriptions.push(
    vscode.commands.registerCommand('easySysml.restartServer', async () => {
      outputChannel.appendLine('Restarting language server…');
      await client?.restart();
      outputChannel.appendLine('Language server restarted.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('easySysml.openChat', () => {
      const panel = vscode.window.createWebviewPanel(
        'sysmlChat',
        'SysML Chat',
        vscode.ViewColumn.Beside,
        { enableScripts: true },
      );
      panel.webview.html = getChatPanelHtml();
    }),
  );
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}

/* ------------------------------------------------------------------ */
/*  Chat Panel HTML                                                    */
/* ------------------------------------------------------------------ */

function getChatPanelHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SysML Chat</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 12px; margin: 0; }
    h2 { color: var(--vscode-foreground); }
    #chat { display: flex; flex-direction: column; height: 90vh; }
    #messages { flex: 1; overflow-y: auto; padding: 8px; }
    .message { margin: 4px 0; padding: 8px; border-radius: 6px; }
    .user { background: var(--vscode-input-background); text-align: right; }
    .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); }
    #inputRow { display: flex; gap: 8px; }
    #prompt { flex: 1; padding: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; }
    button { padding: 8px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    pre { background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div id="chat">
    <h2>SysML Chat</h2>
    <p style="color: var(--vscode-descriptionForeground)">
      Describe a system and get SysML v2 model code.
    </p>
    <div id="messages"></div>
    <div id="inputRow">
      <input id="prompt" type="text" placeholder="Describe your system…" />
      <button onclick="send()">Send</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messagesEl = document.getElementById('messages');
    const promptEl = document.getElementById('prompt');

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function send() {
      const text = promptEl.value.trim();
      if (!text) return;
      addMessage('user', text);
      promptEl.value = '';
      addMessage('assistant', 'AI integration coming soon — connect your preferred LLM provider to generate SysML v2 models from natural language.');
    }

    promptEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') send();
    });
  </script>
</body>
</html>`;
}
