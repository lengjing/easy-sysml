/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */

import type { SDKMessage, SDKResultMessage } from '../entrypoints/agentSdkTypes.js'
import { peekForStdinData, registerProcessOutputErrorHandlers, writeToStderr, writeToStdout } from '../utils/process.js'
import { jsonStringify } from '../utils/slowOperations.js'
import type { DirectConnectConfig } from './directConnectManager.js'

type HeadlessMessage = SDKMessage & {
  request_id?: string
  request?: { subtype?: string }
  response?: unknown
  content?: string
  exit_code?: number | null
}

function appendAuthToken(wsUrl: string, authToken?: string): string {
  if (!authToken) {
    return wsUrl
  }

  const url = new URL(wsUrl)
  if (!url.searchParams.has('token')) {
    url.searchParams.set('token', authToken)
  }
  return url.toString()
}

function isResultMessage(message: HeadlessMessage): message is SDKResultMessage {
  return message.type === 'result'
}

function writeResult(result: SDKResultMessage, outputFormat: string): void {
  switch (outputFormat) {
    case 'json':
      writeToStdout(jsonStringify(result) + '\n')
      return
    case 'stream-json':
      return
    default:
      if (result.subtype === 'success') {
        const text = result.result ?? ''
        writeToStdout(text.endsWith('\n') ? text : `${text}\n`)
        return
      }

      switch (result.subtype) {
        case 'error_during_execution':
          writeToStdout('Execution error\n')
          return
        case 'error_max_turns':
          writeToStdout('Error: Reached max turns\n')
          return
        case 'error_max_budget_usd':
          writeToStdout('Error: Exceeded USD budget\n')
          return
        case 'error_max_structured_output_retries':
          writeToStdout(
            'Error: Failed to provide valid structured output after maximum retries\n',
          )
          return
      }
  }
}

async function readPromptFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return ''
  }

  const timedOut = await peekForStdinData(process.stdin, 50)
  if (timedOut) {
    return ''
  }

  process.stdin.setEncoding('utf8')
  let data = ''
  for await (const chunk of process.stdin) {
    data += chunk
  }
  return data
}

function createPermissionDeniedResponse(requestId: string): string {
  return jsonStringify({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: {
        behavior: 'deny',
        message:
          'Headless direct connect does not support interactive permission prompts; rerun with --dangerously-skip-permissions.',
      },
    },
  })
}

export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive: boolean,
): Promise<void> {
  registerProcessOutputErrorHandlers()

  const effectivePrompt = prompt.trim() ? prompt : await readPromptFromStdin()
  if (!effectivePrompt.trim()) {
    writeToStderr(
      'Error: Input must be provided either through stdin or as a prompt argument when using open -p\n',
    )
    process.exitCode = 1
    return
  }

  if (!interactive && !prompt.trim()) {
    writeToStderr(
      'Error: open requires -p/--print for headless direct-connect mode\n',
    )
    process.exitCode = 1
    return
  }

  const wsUrl = appendAuthToken(config.wsUrl, config.authToken)
  const socket = new WebSocket(wsUrl)

  let lastResult: SDKResultMessage | undefined
  let sessionExitCode: number | null | undefined
  let serverError: string | undefined

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('message', onMessage)
      socket.removeEventListener('error', onError)
      socket.removeEventListener('close', onClose)
    }

    const finish = () => {
      cleanup()
      resolve()
    }

    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onOpen = () => {
      socket.send(
        jsonStringify({
          type: 'user',
          message: {
            role: 'user',
            content: effectivePrompt,
          },
          parent_tool_use_id: null,
          session_id: '',
        }),
      )
    }

    const onMessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data)
      const lines = data.split('\n').filter(line => line.trim())

      for (const line of lines) {
        const parsed = JSON.parse(line) as HeadlessMessage

        if (parsed.type === 'server_error') {
          serverError = parsed.content ?? 'Unknown server error'
          writeToStderr(serverError.endsWith('\n') ? serverError : `${serverError}\n`)
          continue
        }

        if (parsed.type === 'server_session_done') {
          sessionExitCode = parsed.exit_code ?? null
          if (lastResult || sessionExitCode !== null) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.close()
            }
            finish()
          }
          continue
        }

        if (outputFormat === 'stream-json') {
          writeToStdout(line.endsWith('\n') ? line : `${line}\n`)
        }

        if (parsed.type === 'control_request' && parsed.request_id) {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(createPermissionDeniedResponse(parsed.request_id))
          }
          continue
        }

        if (isResultMessage(parsed)) {
          lastResult = parsed
          if (outputFormat !== 'stream-json') {
            writeResult(parsed, outputFormat)
          }
          if (socket.readyState === WebSocket.OPEN) {
            socket.close()
          }
          finish()
          return
        }
      }
    }

    const onError = () => {
      fail(new Error(`Failed to connect to server at ${config.serverUrl}`))
    }

    const onClose = () => {
      if (lastResult) {
        finish()
        return
      }

      if (serverError) {
        fail(new Error(serverError))
        return
      }

      if (sessionExitCode !== undefined && sessionExitCode !== 0) {
        fail(new Error(`Remote session exited with code ${sessionExitCode}`))
        return
      }

      finish()
    }

    socket.addEventListener('open', onOpen)
    socket.addEventListener('message', onMessage)
    socket.addEventListener('error', onError)
    socket.addEventListener('close', onClose)
  })

  if (lastResult?.is_error) {
    process.exitCode = 1
  }
}