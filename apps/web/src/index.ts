/**
 * Easy SysML Web App — Monaco editor with SysML v2 language support.
 *
 * This is the entry point for the browser-based SysML editor.
 * In a full deployment, Monaco is loaded from a CDN and the language
 * server runs as a Web Worker communicating via the LSP protocol.
 *
 * This module bootstraps the editor and the chat panel UI.
 */

/* ------------------------------------------------------------------ */
/*  Editor Bootstrap                                                   */
/* ------------------------------------------------------------------ */

const SAMPLE_SYSML = `package VehicleSystem {
  part def Vehicle {
    part engine : Engine;
    part transmission : Transmission;
    port fuelPort : FuelPort;
  }

  part def Engine {
    attribute horsepower : Integer;
    attribute displacement : Real;
  }

  part def Transmission {
    attribute gearCount : Integer;
  }

  port def FuelPort;
}
`;

function createEditorContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.id = 'editor';
  container.style.cssText = 'width:100%;height:60vh;border:1px solid #ccc;';
  return container;
}

function createChatPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  panel.id = 'chat-panel';
  panel.innerHTML = `
    <h3>SysML Chat</h3>
    <div id="chat-messages" style="height:20vh;overflow-y:auto;border:1px solid #ccc;padding:8px;margin-bottom:8px;"></div>
    <div style="display:flex;gap:8px;">
      <input id="chat-input" type="text" placeholder="Describe your system…" style="flex:1;padding:6px;" />
      <button id="chat-send" style="padding:6px 16px;">Send</button>
    </div>
    <p style="color:#888;font-size:0.85em;margin-top:4px;">
      AI integration placeholder — connect an LLM provider to generate SysML v2 from natural language.
    </p>
  `;
  return panel;
}

function boot(): void {
  const app = document.getElementById('app');
  if (!app) {
    console.error('#app container not found');
    return;
  }

  // Title
  const title = document.createElement('h2');
  title.textContent = 'Easy SysML — Web Editor';
  app.appendChild(title);

  // Editor container (Monaco will mount here)
  const editorContainer = createEditorContainer();
  app.appendChild(editorContainer);

  // Fallback textarea when Monaco is not available
  const textarea = document.createElement('textarea');
  textarea.style.cssText = 'width:100%;height:100%;font-family:monospace;font-size:14px;tab-size:2;';
  textarea.value = SAMPLE_SYSML;
  editorContainer.appendChild(textarea);

  // Chat panel
  const chatPanel = createChatPanel();
  app.appendChild(chatPanel);

  // Wire chat send
  const sendBtn = document.getElementById('chat-send') as HTMLButtonElement | null;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement | null;
  const chatMessages = document.getElementById('chat-messages');

  if (sendBtn && chatInput && chatMessages) {
    const send = (): void => {
      const text = chatInput.value.trim();
      if (!text) return;

      const userMsg = document.createElement('div');
      userMsg.textContent = `You: ${text}`;
      userMsg.style.marginBottom = '4px';
      chatMessages.appendChild(userMsg);

      const aiMsg = document.createElement('div');
      aiMsg.textContent = 'AI: Connect an LLM provider to enable SysML generation.';
      aiMsg.style.cssText = 'margin-bottom:4px;color:#666;';
      chatMessages.appendChild(aiMsg);

      chatInput.value = '';
      chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    sendBtn.addEventListener('click', send);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  }
}

// --- Launch ---
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
