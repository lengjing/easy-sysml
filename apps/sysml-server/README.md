# sysml-server

Node.js backend for easy-sysml that integrates with the free-code agent.

## Features

- **Project management** — Create, read, update and delete SysML projects
- **SysML file management** — Manage SysML source files linked to projects
- **free-code session management** — Create and manage free-code agent sessions per project
- **Direct chat** — Stateful multi-turn chat via `/api/chat` (compatible with easy-sysml AIChatPanel)
- **Real-time streaming** — Stream free-code agent messages (text, thinking, tool calls, file writes) via SSE

## Quick Start

### 1. Configure the server

```bash
cp .env.example .env
# Edit .env — set FREE_CODE_SERVER_URL if free-code is on a different port
```

### 2. Start free-code server with an AI provider

**DeepSeek (OpenAI-compatible):**

```bash
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
export OPENAI_COMPAT_API_KEY=your-deepseek-api-key
export OPENAI_COMPAT_PROVIDER=deepseek
npx @anthropic-ai/claude-code --server --port 3002
```

**Qwen (OpenAI-compatible):**

```bash
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export OPENAI_COMPAT_API_KEY=your-qwen-api-key
npx @anthropic-ai/claude-code --server --port 3002
```

### 3. Start sysml-server

```bash
pnpm dev   # or:  npm run dev
```

### 4. Start easy-sysml

```bash
cd apps/easy-sysml && pnpm dev
```

The Vite proxy forwards `/api/*` to sysml-server on port 3001.

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port to listen on |
| `FREE_CODE_SERVER_URL` | `http://localhost:3002` | URL of the running free-code server |
| `FREE_CODE_AUTH_TOKEN` | _(none)_ | Optional auth token for free-code server |
| `FREE_CODE_WORK_DIR` | _(cwd)_ | Default working directory for free-code sessions |
| `DB_PATH` | `./data/sysml.db` | SQLite database file path |

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
| `code` | `{content, language, autoApply, filePath}` | SysML file written |
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

### Sessions (free-code agent)

```
GET    /api/projects/:projectId/sessions          List sessions
POST   /api/projects/:projectId/sessions          Create session (creates free-code session)
GET    /api/projects/:projectId/sessions/:id      Get session
DELETE /api/projects/:projectId/sessions/:id      Stop session
```

### Chat (SSE streaming)

```
POST   /api/sessions/:sessionId/chat              Send message, stream response (SSE)
```

Request body: `{ "message": "..." }`

SSE events:
- `delta` — streaming text `{ content: string }`
- `thinking` — thinking content `{ content: string }`
- `tool_call` — tool use `{ id, name, input, status, result? }`
- `result` — final result `{ result, is_error, duration_ms, total_cost_usd }`
- `error` — error `{ content: string }`
- `done` — stream complete `{}`
