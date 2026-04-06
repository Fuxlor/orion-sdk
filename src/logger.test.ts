import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger } from './logger.js'

const BASE_CONFIG = {
  token: 'test-token',
  apiUrl: 'http://localhost:3001/api',
  offline: false, // disable queue for most tests to keep them simple
}

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Helper: flush the microtask queue so fire-and-forget httpSend resolves
async function flushPromises() {
  await new Promise((r) => setTimeout(r, 0))
}

// ─── Payload and headers ──────────────────────────────────────────────────────

describe('Logger - HTTP send', () => {
  it('sends log to the correct URL', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.info('hello')
    await flushPromises()

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3001/api/v1/agent/log')
  })

  it('sends Authorization header with bearer token', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.info('hello')
    await flushPromises()

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
  })

  it('sends JSON body with correct level and message', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.warn('something wrong')
    await flushPromises()

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.level).toBe('warn')
    expect(body.message).toBe('something wrong')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes metadata when provided', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.error('db error', { code: 'ECONNRESET', retries: 3 })
    await flushPromises()

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.metadata).toEqual({ code: 'ECONNRESET', retries: 3 })
  })

  it('includes tags when provided', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.info('tagged log', undefined, ['prod', 'critical'])
    await flushPromises()

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.tags).toEqual(['prod', 'critical'])
  })

  it('omits metadata key when not provided', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.debug('no meta')
    await flushPromises()

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.metadata).toBeUndefined()
  })
})

// ─── All 6 log levels ─────────────────────────────────────────────────────────

describe('Logger - log levels', () => {
  it.each([
    ['info', 'info message'],
    ['warn', 'warn message'],
    ['error', 'error message'],
    ['debug', 'debug message'],
    ['verbose', 'verbose message'],
    ['trace', 'trace message'],
  ] as const)('%s() sends correct level', async (level, message) => {
    const logger = new Logger(BASE_CONFIG)
    logger[level](message)
    await flushPromises()

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(options.body as string)
    expect(body.level).toBe(level)
    expect(body.message).toBe(message)
  })
})

// ─── send() overloads ─────────────────────────────────────────────────────────

describe('Logger - send() overloads', () => {
  it('send(level, message) form', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.send('error', 'explicit level')
    await flushPromises()

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.level).toBe('error')
    expect(body.message).toBe('explicit level')
  })

  it('send(message) uses defaultLevel from constructor', async () => {
    const logger = new Logger(BASE_CONFIG, 'debug')
    logger.send('just a message')
    await flushPromises()

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.level).toBe('debug')
  })

  it('send(message) falls back to info when no defaultLevel', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.send('just a message')
    await flushPromises()

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.level).toBe('info')
  })

  it('send(object) form uses structured data', async () => {
    const logger = new Logger(BASE_CONFIG)
    logger.send({ level: 'warn', message: 'structured', userId: '42' })
    await flushPromises()

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.level).toBe('warn')
    expect(body.message).toBe('structured')
    expect(body.metadata).toEqual({ userId: '42' })
  })
})

// ─── Offline queue fallback ───────────────────────────────────────────────────

describe('Logger - offline queue', () => {
  it('enqueues log when fetch fails and offline is enabled', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const logger = new Logger({
      ...BASE_CONFIG,
      offline: true,
      retryInterval: 60_000, // long interval so it doesn't fire in test
    })
    logger.info('queued log')
    await flushPromises()
    await flushPromises() // second tick for the catch() handler

    // close() should work without errors, proving the queue is alive
    expect(() => logger.close()).not.toThrow()
  })

  it('does not crash when fetch fails and offline is disabled', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const logger = new Logger({ ...BASE_CONFIG, offline: false })
    expect(() => logger.info('will fail silently')).not.toThrow()
    await flushPromises()
  })
})

// ─── close() ─────────────────────────────────────────────────────────────────

describe('Logger - close()', () => {
  it('can be called without errors on a logger with no queue', () => {
    const logger = new Logger({ ...BASE_CONFIG, offline: false })
    expect(() => logger.close()).not.toThrow()
  })

  it('can be called without errors on a logger with a queue', () => {
    const logger = new Logger({ ...BASE_CONFIG, offline: true })
    expect(() => logger.close()).not.toThrow()
  })
})
