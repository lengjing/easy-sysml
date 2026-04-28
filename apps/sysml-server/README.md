# sysml-server

Node.js backend for easy-sysml that integrates with the free-code agent.

## Features

- **Project management** — Create, read, update and delete SysML projects
- **SysML file management** — Manage SysML source files linked to projects
- **free-code session management** — Create and manage free-code agent sessions per project
- **Real-time chat streaming** — Stream free-code agent messages (text, thinking, tool calls) via SSE

## Setup

```bash
cp .env.example .env
# Edit .env as needed
pnpm dev
```

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port to listen on |
| `FREE_CODE_SERVER_URL` | `http://localhost:3002` | URL of the running free-code server |
| `FREE_CODE_AUTH_TOKEN` | _(none)_ | Optional auth token for free-code server |
| `FREE_CODE_WORK_DIR` | _(cwd)_ | Default working directory for free-code sessions |
| `DB_PATH` | `./data/sysml.db` | SQLite database file path |

## Running free-code server

Start free-code in server mode before using the chat functionality:

```bash
# In the packages/free-code directory
npx claude --server --port 3002
```

Or set `FREE_CODE_BIN` to your claude binary and run:

```bash
claude --server --port 3002
```

## API

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
