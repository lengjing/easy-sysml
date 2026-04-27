# free-code：DeepSeek 接入 & Server 模式使用指南

> **适用版本**：packages/free-code（本仓库）  
> **测试通过**：38 个测试全部绿灯 ✅

---

## 目录

1. [概述](#概述)
2. [使用 DeepSeek（OpenAI 兼容适配器）](#使用-deepseek)
   - [工作原理](#工作原理)
   - [快速开始](#快速开始)
   - [支持的提供商预设](#支持的提供商预设)
   - [环境变量参考](#环境变量参考)
   - [DeepSeek 模型列表](#deepseek-模型列表)
   - [Qwen 示例](#qwen-示例)
3. [Server 模式（HTTP + WebSocket）](#server-模式)
   - [启动服务器](#启动服务器)
   - [HTTP API 参考](#http-api-参考)
   - [WebSocket 会话协议](#websocket-会话协议)
   - [认证](#认证)
   - [客户端示例（Node.js）](#客户端示例-nodejs)
   - [客户端示例（curl）](#客户端示例-curl)
4. [测试说明](#测试说明)
5. [常见问题](#常见问题)

---

## 概述

`packages/free-code` 为 Claude Code CLI 提供了两项关键扩展：

| 功能 | 文件 | 说明 |
|------|------|------|
| **OpenAI 兼容适配器** | `src/services/api/openai-compat-fetch-adapter.ts` | 将 Anthropic Messages API 格式翻译为 OpenAI Chat Completions 格式，支持 DeepSeek、Qwen 等模型 |
| **HTTP + WebSocket 服务器** | `src/server/httpServer.ts` | 将 free-code CLI 以 REST + WebSocket 服务形式对外暴露，支持多会话并发 |

---

## 使用 DeepSeek

### 工作原理

```
Claude Code CLI
  └── Anthropic SDK (fetch)
        └── openai-compat-fetch-adapter  ← 拦截 /messages 请求
              └── DeepSeek API (https://api.deepseek.com/v1/chat/completions)
```

适配器拦截 Anthropic SDK 发出的 fetch 请求，将其翻译成 OpenAI Chat Completions 格式后转发到 DeepSeek（或其他兼容端点），再将响应翻译回 Anthropic 格式。整个过程对 Claude Code 上层逻辑完全透明。

### 快速开始

#### 步骤 1：获取 DeepSeek API Key

前往 [platform.deepseek.com](https://platform.deepseek.com) 注册并创建 API Key。

#### 步骤 2：设置环境变量

```bash
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
export OPENAI_COMPAT_API_KEY=sk-your-deepseek-api-key
# 可选：指定模型（默认 deepseek-chat）
export OPENAI_COMPAT_MODEL=deepseek-chat
```

#### 步骤 3：正常使用 Claude Code

```bash
# 交互式对话
claude

# 单次提示（print 模式）
claude -p "帮我写一个冒泡排序算法"

# 指定输出格式
claude -p "解释 SysML 的 Block Definition Diagram" --output-format json
```

> **注意**：`ANTHROPIC_API_KEY` 环境变量可以设置为任意非空字符串（适配器不使用它，但 Anthropic SDK 初始化时可能检查其存在）。

```bash
export ANTHROPIC_API_KEY=dummy
```

### 支持的提供商预设

| 提供商 | `OPENAI_COMPAT_BASE_URL` | 默认模型 |
|--------|--------------------------|----------|
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **Qwen（阿里云）** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 任意 OpenAI 兼容端点 | 自定义 URL | 通过 `OPENAI_COMPAT_MODEL` 指定 |

### 环境变量参考

| 变量 | 必填 | 说明 |
|------|------|------|
| `CLAUDE_CODE_USE_OPENAI_COMPAT` | ✅ | 设置为 `1` 启用适配器 |
| `OPENAI_COMPAT_BASE_URL` | ✅ | OpenAI 兼容 API 的 base URL（含 `/v1`） |
| `OPENAI_COMPAT_API_KEY` | ✅ | API Key |
| `OPENAI_COMPAT_MODEL` | ❌ | 目标模型名称（覆盖自动映射） |

### DeepSeek 模型列表

| 模型 ID | 说明 |
|---------|------|
| `deepseek-chat` | DeepSeek-V3，通用对话，性价比高 |
| `deepseek-reasoner` | DeepSeek-R1，具备推理能力 |

```bash
export OPENAI_COMPAT_MODEL=deepseek-reasoner
```

### Qwen 示例

```bash
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export OPENAI_COMPAT_API_KEY=sk-your-qwen-api-key
export OPENAI_COMPAT_MODEL=qwen-max

claude -p "用 SysML v2 定义一个汽车系统"
```

---

## Server 模式

### 启动服务器

#### 方式一：命令行（build 后）

```bash
# 构建 dev 版本
cd packages/free-code
npm run build:dev   # 或 bun run build:dev

# 启动服务器（默认 127.0.0.1:8080）
claude serve

# 自定义参数
claude serve --port 9000 --host 0.0.0.0 --auth-token my-secret --max-sessions 10

# 指定工作目录
claude serve --workspace /path/to/project
```

#### 方式二：编程方式（Node.js）

```typescript
import { createFreeCodeServer, serveMain } from './src/server/httpServer.js'

// 方式 A：使用 serveMain（含优雅关闭）
await serveMain({
  port: 8080,
  host: '127.0.0.1',
  authToken: 'my-secret',
  maxSessions: 10,
  workspace: '/tmp/workspace',
})

// 方式 B：直接使用工厂函数
const srv = createFreeCodeServer({
  port: 8080,
  host: '127.0.0.1',
  authToken: '',
})
const { port, host } = await srv.listen()
console.log(`Listening on http://${host}:${port}`)
```

#### 方式三：环境变量

```bash
export CLAUDE_CODE_SERVER_PORT=8080
export CLAUDE_CODE_SERVER_HOST=0.0.0.0
export CLAUDE_CODE_SERVER_AUTH_TOKEN=my-secret
claude serve
```

### HTTP API 参考

#### `GET /health`

检查服务器状态。

```bash
curl http://localhost:8080/health
```

**响应** (200):
```json
{
  "status": "ok",
  "version": "1.0.0",
  "sessions": 2
}
```

---

#### `GET /sessions`

列出所有活跃会话。

```bash
curl http://localhost:8080/sessions
```

**响应** (200):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "running",
    "createdAt": 1714000000000,
    "workDir": "/tmp/project"
  }
]
```

---

#### `POST /sessions`

创建新会话（启动 `claude -p --output-format stream-json --input-format stream-json` 子进程）。

```bash
curl -X POST http://localhost:8080/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "cwd": "/tmp/my-project",
    "model": "claude-opus-4-5",
    "dangerously_skip_permissions": false
  }'
```

**请求体参数**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `cwd` | `string` | ❌ | 工作目录（默认为 `--workspace` 或当前目录） |
| `model` | `string` | ❌ | 模型名称 |
| `dangerously_skip_permissions` | `boolean` | ❌ | 跳过权限确认（谨慎使用） |
| `system_prompt` | `string` | ❌ | 系统提示词 |
| `max_turns` | `number` | ❌ | 最大对话轮数 |
| `allowed_tools` | `string[]` | ❌ | 允许使用的工具列表 |
| `prompt` | `string` | ❌ | 首次提示（作为位置参数传入） |

**响应** (201):
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "ws_url": "ws://localhost:8080/sessions/550e8400-e29b-41d4-a716-446655440000",
  "work_dir": "/tmp/my-project"
}
```

**错误响应** (400):
```json
{ "error": "Working directory does not exist: /no/such/path" }
{ "error": "Maximum number of concurrent sessions (10) reached" }
{ "error": "Invalid JSON body" }
```

---

#### `DELETE /sessions/:id`

终止并删除指定会话。

```bash
curl -X DELETE http://localhost:8080/sessions/550e8400-e29b-41d4-a716-446655440000
```

**响应** (200):
```json
{ "ok": true }
```

**响应** (404，会话不存在):
```json
{ "error": "Session not found" }
```

---

### WebSocket 会话协议

连接 `ws_url`（`POST /sessions` 返回的 `ws_url` 字段）后，即可与 claude 子进程双向通信。

#### 客户端 → 服务器（发送消息）

以 JSON 格式发送，每条消息一行（stream-json 格式）：

```json
{"type":"user","message":{"role":"user","content":"帮我写一个 hello world"}}
```

#### 服务器 → 客户端（接收事件）

服务器将 claude 子进程的 stream-json 输出逐行转发给客户端：

```json
{"type":"assistant","message":{"id":"msg_01X...","type":"message","role":"assistant","content":[{"type":"text","text":"好的，"}],...}}
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"以下是"}}
{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":42}}
{"type":"result","subtype":"success","cost_usd":0.001}
```

服务器额外注入的事件：

| 事件类型 | 说明 |
|----------|------|
| `server_error` | claude stderr 输出 |
| `server_session_done` | 子进程退出（含 `exit_code`） |

---

### 认证

当服务器以 `--auth-token` 或 `CLAUDE_CODE_SERVER_AUTH_TOKEN` 启动时，所有请求需携带 Bearer Token。

**HTTP 请求**：
```bash
curl -H "Authorization: Bearer my-secret" http://localhost:8080/health
```

**WebSocket 升级**：
```
# 方式一：查询参数
ws://localhost:8080/sessions/<id>?token=my-secret

# 方式二：HTTP 头（在升级握手中）
Authorization: Bearer my-secret
```

---

### 客户端示例（Node.js）

```typescript
import { WebSocket } from 'ws'

async function runSession(serverUrl: string, prompt: string) {
  // 1. 创建会话
  const res = await fetch(`${serverUrl}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd: process.cwd() }),
  })
  const { session_id, ws_url } = await res.json()
  console.log('Session created:', session_id)

  // 2. 建立 WebSocket 连接
  const ws = new WebSocket(ws_url)

  ws.on('open', () => {
    // 3. 发送第一条消息
    ws.send(JSON.stringify({
      type: 'user',
      message: { role: 'user', content: prompt },
    }))
  })

  ws.on('message', (data: Buffer) => {
    const event = JSON.parse(data.toString())
    if (event.type === 'content_block_delta') {
      process.stdout.write(event.delta?.text ?? '')
    } else if (event.type === 'server_session_done') {
      console.log('\n--- Done (exit code:', event.exit_code, ')')
      ws.close()
    }
  })
}

runSession('http://localhost:8080', '用 TypeScript 写一个斐波那契函数')
```

---

### 客户端示例（curl）

```bash
# 启动服务器（后台）
claude serve &
SERVER_PID=$!

# 创建会话
RESPONSE=$(curl -s -X POST http://localhost:8080/sessions \
  -H "Content-Type: application/json" \
  -d '{"cwd":"/tmp"}')

SESSION_ID=$(echo $RESPONSE | jq -r .session_id)
echo "Session: $SESSION_ID"

# 查看所有会话
curl -s http://localhost:8080/sessions | jq .

# 终止会话
curl -s -X DELETE http://localhost:8080/sessions/$SESSION_ID | jq .

# 停止服务器
kill $SERVER_PID
```

---

## 测试说明

### 运行所有测试

```bash
cd packages/free-code

# 运行 OpenAI 兼容适配器测试（18 个）
npx vitest run src/services/api/__tests__/

# 运行 HTTP/WebSocket 服务器测试（20 个）
npx vitest run src/server/__tests__/

# 运行全部测试（38 个）
npx vitest run src/server/__tests__/ src/services/api/__tests__/
```

### 测试覆盖范围

#### OpenAI 兼容适配器测试（`src/services/api/__tests__/openai-compat-fetch-adapter.test.ts`）

| 测试组 | 测试数 | 覆盖内容 |
|--------|--------|---------|
| `OPENAI_COMPAT_PROVIDERS` | 2 | deepseek/qwen 预设字段验证 |
| `getOpenAICompatFetch()` | 5 | 环境变量启用/禁用逻辑 |
| `createOpenAICompatFetch()` | 11 | 消息翻译、工具翻译、流式响应翻译 |
| **合计** | **18** | |

#### HTTP/WebSocket 服务器测试（`src/server/__tests__/httpServer.test.ts`）

| 测试组 | 测试数 | 覆盖内容 |
|--------|--------|---------|
| `GET /health` | 2 | 正常响应、Token 鉴权 |
| `GET /sessions` | 1 | 空列表 |
| `POST /sessions` | 7 | 无效 JSON、目录不存在、成功创建、ws_url 格式、并发上限、model 参数、空 body |
| `DELETE /sessions/:id` | 2 | 404 未知会话、成功删除 |
| 未知路由 | 1 | 404 响应 |
| WebSocket 升级 | 4 | 101 握手、未知会话拒绝、缺少 Token、查询参数 Token |
| 服务器配置 | 3 | host 绑定、sessions.size 计数、GET /sessions 列表 |
| **合计** | **20** | |

---

## 常见问题

### Q：使用 DeepSeek 时提示 "OPENAI_COMPAT_BASE_URL or OPENAI_COMPAT_API_KEY is missing"

**A**：请确保同时设置了这两个变量：
```bash
export OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
export OPENAI_COMPAT_API_KEY=sk-...
```

### Q：Server 模式下 `POST /sessions` 返回 400 "Working directory does not exist"

**A**：请传入实际存在的目录路径：
```bash
curl -X POST http://localhost:8080/sessions \
  -H "Content-Type: application/json" \
  -d '{"cwd":"/tmp"}'
```

### Q：WebSocket 升级被拒绝（非 101）

**A**：可能原因：
1. 会话 ID 不存在或已过期（会话退出后 30 秒自动删除）
2. 服务器配置了 `authToken`，但请求未携带 Token

### Q：适配器支持工具调用（tool use）吗？

**A**：支持。适配器会将 Anthropic 的 `tool_use` 块翻译为 OpenAI 的 `function_call`，并将 `tool_result` 翻译为 OpenAI 的 `tool` 角色消息。但实际效果取决于目标模型对 function calling 的支持程度。

### Q：DeepSeek 流式响应是否支持？

**A**：支持。适配器会将 OpenAI SSE 格式（`data: {"choices":[{"delta":...}]}`）实时翻译为 Anthropic SSE 格式（`event: content_block_delta` 等）。

### Q：如何在 build:dev 后使用 DeepSeek？

```bash
# 1. 构建
cd packages/free-code
npm run build:dev

# 2. 设置环境变量
export CLAUDE_CODE_USE_OPENAI_COMPAT=1
export OPENAI_COMPAT_BASE_URL=https://api.deepseek.com/v1
export OPENAI_COMPAT_API_KEY=sk-your-key
export ANTHROPIC_API_KEY=dummy  # SDK 初始化需要，适配器不使用

# 3. 运行
./claude -p "你好，DeepSeek！"
```
