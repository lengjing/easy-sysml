import { describe, expect, it } from 'vitest'
import { parseConnectUrl } from '../parseConnectUrl.js'

describe('parseConnectUrl', () => {
  it('parses cc:// urls with embedded auth token', () => {
    expect(parseConnectUrl('cc://127.0.0.1:9999/secret')).toEqual({
      serverUrl: 'http://127.0.0.1:9999',
      authToken: 'secret',
    })
  })

  it('accepts plain host:port input', () => {
    expect(parseConnectUrl('127.0.0.1:8080')).toEqual({
      serverUrl: 'http://127.0.0.1:8080',
    })
  })

  it('rejects cc+unix urls explicitly', () => {
    expect(() => parseConnectUrl('cc+unix:///tmp/claude.sock')).toThrow(
      /not supported/i,
    )
  })
})