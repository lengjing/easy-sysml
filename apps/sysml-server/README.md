# sysml-server

Node.js backend for easy-sysml that proxies Claude server sessions and manages project workspaces.

## Features

- **Project management** — Create, read, update, and delete SysML projects
- **SysML file management** — Manage SysML source files inside each project workspace
- **Project-scoped Claude servers** — By default, sysml-server starts one managed `claude server` per project work directory
- **Session APIs** — Project session and chat-session endpoints are compatibility views over upstream Claude sessions
- **Direct chat** — Stateful multi-turn chat via `/api/chat` (compatible with easy-sysml AIChatPanel)
- **Real-time streaming** — Stream Claude server messages (text, thinking, tool calls, file writes) via SSE
- **Minimal local persistence** — SQLite stores only projects and AI API keys

## Quick Start

### 1. Configure the server

```bash
cp .env.example .env
```

Edit `.env` only if you need a custom DB path, admin credentials, or static upstream server mode.

### 2. Make sure the global `claude` command works

```bash
claude --version
```

sysml-server launches `claude server` processes itself in managed mode. If `claude` is not on `PATH`, project chat cannot start.

### 3. Configure the AI provider environment

**DeepSeek (OpenAI-compatible):**

```bash
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
export OPENAI_COMPAT_API_KEY=your-deepseek-api-key
export OPENAI_COMPAT_PROVIDER=deepseek
```

**Qwen (OpenAI-compatible):**

```bash
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export OPENAI_COMPAT_API_KEY=your-qwen-api-key
```

### 4. Start sysml-server

```bash
pnpm dev   # or:  npm run dev
```

### 5. Start easy-sysml

```bash
cd apps/easy-sysml && pnpm dev
```

The Vite proxy forwards `/api/*` to sysml-server on port 3001.

### Optional: static upstream server mode

If you prefer to run a single external Claude server instead of managed per-project servers:

```bash
SYSML_MANAGE_FORK_SERVERS=0
AGENT_SERVER_URL=http://localhost:3002
AGENT_SERVER_AUTH_TOKEN=your-token-if-needed
```

Then start the upstream server yourself:

```bash
claude server --host 127.0.0.1 --port 3002
```

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port to listen on |
| `SYSML_MANAGE_FORK_SERVERS` | `1` | When not `0`, sysml-server launches one managed `claude server` per project |
| `SYSML_AGENT_SERVER_PORT_BASE` | `35100` | First port in the managed Claude server pool |
| `SYSML_AGENT_SERVER_PORT_SPAN` | `1500` | Size of the managed Claude server port pool |
| `AGENT_SERVER_URL` | `http://localhost:3002` | Static upstream Claude server URL when managed mode is disabled |
| `AGENT_SERVER_AUTH_TOKEN` | _(none)_ | Optional auth token for a static upstream Claude server |
| `AGENT_SERVER_WORK_DIR` | _(cwd)_ | Fallback working directory for direct chat requests without a project |
| `DB_PATH` | `./data/sysml.db` | SQLite database file path |
| `EASY_SYSML_ADMIN_USERNAME` | `admin` | Username for the admin-only API key management page |
| `EASY_SYSML_ADMIN_PASSWORD` | `easy-sysml-admin` | Password for the admin-only API key management page |

## API

### Direct Chat (used by easy-sysml AIChatPanel)

```
POST /api/chat
```

Request body:
```json
{
  "messages": [{"role": "user", "content": "..."}],
  "currentCode": "...",
  "conversationId": "...",
  "autoApply": true
}
```

SSE event stream:
| Event | Data | Description |
|---|---|---|
| `session` | `{conversationId}` | Conversation ID (first event) |
| `delta` | `{content}` | Streaming text chunk |
| `thinking` | `{content}` | Agent reasoning |
| `tool_call` | `{id, name, input?, status, result?}` | Tool invocation/result |
| `result` | `{is_error, duration_ms, total_cost_usd}` | Final summary |
| `error` | `{content}` | Error message |
| `done` | `{}` | Stream complete |

### Projects

```
GET    /api/projects                              List all projects
POST   /api/projects                              Create project {name, description?}
GET    /api/projects/:id                          Get project
PUT    /api/projects/:id                          Update project {name?, description?}
DELETE /api/projects/:id                          Delete project
```

### SysML Files

```
GET    /api/projects/:projectId/files             List files
POST   /api/projects/:projectId/files             Create file {name, path?, content?}
GET    /api/projects/:projectId/files/:fileId     Get file
PUT    /api/projects/:projectId/files/:fileId     Update file {name?, content?}
DELETE /api/projects/:projectId/files/:fileId     Delete file
```

### Sessions (Claude server)

```
GET    /api/projects/:projectId/sessions          List sessions
POST   /api/projects/:projectId/sessions          Create session
GET    /api/projects/:projectId/sessions/:id      Get session
DELETE /api/projects/:projectId/sessions/:id      Not supported
```

### Chat Sessions (compatibility view)

```
GET    /api/projects/:projectId/chat-sessions
POST   /api/projects/:projectId/chat-sessions
GET    /api/projects/:projectId/chat-sessions/:id
PUT    /api/projects/:projectId/chat-sessions/:id
DELETE /api/projects/:projectId/chat-sessions/:id
```

These endpoints are compatibility projections over upstream Claude sessions and transcript history. Local chat-session rows are no longer stored in SQLite.

### Admin Session

```
GET    /api/admin/session                        Check whether the admin session is valid
POST   /api/admin/session/login                  Login with {username, password}
DELETE /api/admin/session                        Logout the current admin session
```

Admin session requests use the `X-Admin-Session` header. The frontend admin page stores the returned session token locally and sends it automatically for API key management.

### AI API Keys

```
GET    /api/ai/keys                              List all AI API keys (admin only)
POST   /api/ai/keys                              Create a new AI API key (admin only)
DELETE /api/ai/keys/:id                          Revoke an AI API key (admin only)
```
