export type ParsedConnectUrl = {
  serverUrl: string
  authToken?: string
}

export function parseConnectUrl(input: string): ParsedConnectUrl {
  if (input.startsWith('cc://')) {
    const raw = input.slice('cc://'.length)
    const parsed = new URL(`http://${raw}`)
    const authToken = parsed.pathname.slice(1) || undefined

    return {
      serverUrl: `http://${parsed.host}`,
      authToken,
    }
  }

  if (input.startsWith('cc+unix://')) {
    throw new Error(
      'Unix socket connect (cc+unix://) is not supported by the direct-connect client',
    )
  }

  const normalized = /^https?:\/\//i.test(input) ? input : `http://${input}`
  const parsed = new URL(normalized)

  return {
    serverUrl: `${parsed.protocol}//${parsed.host}`,
  }
}