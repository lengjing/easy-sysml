import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type RunningServerLock = {
  host: string
  httpUrl: string
  pid: number
  port: number
  startedAt: number
}

function getLockfilePath(): string {
  return (
    process.env.CLAUDE_CODE_SERVER_LOCKFILE ??
    join(homedir(), '.claude', 'server-lock.json')
  )
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function writeServerLock(lock: RunningServerLock): Promise<void> {
  const lockfilePath = getLockfilePath()
  await fs.mkdir(dirname(lockfilePath), { recursive: true })
  await fs.writeFile(lockfilePath, JSON.stringify(lock, null, 2), 'utf8')
}

export async function removeServerLock(): Promise<void> {
  try {
    await fs.rm(getLockfilePath(), { force: true })
  } catch {
    // Ignore best-effort cleanup failures.
  }
}

export async function probeRunningServer(): Promise<RunningServerLock | null> {
  try {
    const raw = await fs.readFile(getLockfilePath(), 'utf8')
    const parsed = JSON.parse(raw) as RunningServerLock
    if (!isProcessAlive(parsed.pid)) {
      await removeServerLock()
      return null
    }
    return parsed
  } catch {
    return null
  }
}