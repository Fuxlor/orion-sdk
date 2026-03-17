import { OfflineQueue } from './queue.js'
import { getPerformanceLoggingThread } from './performance.js'
import { getHeartbeatThread } from './heartbeat.js'
import type { LogLevel, LogPayload, OrionConfig } from './types.js'

/**
 * Logger — the object the user interacts with daily.
 *
 * USAGE:
 *   const logger = await createLogger()
 *   logger.info('Server started')
 *   logger.error('DB connection failed')
 *   logger.send('warn', 'Rate limit reached')
 *   logger.send({ level: 'debug', message: 'Request received', userId: '123' })
 *
 *   const logger = Orion.createLogger('debug')
 *   logger.send('Server started')
 *
 * SENDING:
 *   Each log is sent via an HTTP POST (native fetch).
 *   If the API is unavailable and offline mode is enabled,
 *   logs are queued and automatically retried.
 */
export class Logger {
  private readonly url: string
  private readonly headers: Record<string, string>
  private readonly offlineEnabled: boolean
  private readonly offlineQueue: OfflineQueue | null
  private readonly defaultLevel: LogLevel | null
  constructor(config: OrionConfig, defaultLevel?: LogLevel) {
    this.defaultLevel = defaultLevel ?? null
    const apiUrl = config.apiUrl ?? 'http://localhost:3001/api'
    this.url = `${apiUrl}/logs/emit`

    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    }

    this.offlineEnabled = config.offline !== false
    this.offlineQueue = this.offlineEnabled
      ? new OfflineQueue(config, (payload) => this.httpSend(payload))
      : null

    if (config.performance !== false) {
      getPerformanceLoggingThread(config)
    }

    if (config.heartbeat !== false) {
      getHeartbeatThread(config)
    }
  }

  // ─── Level methods ────────────────────────────────────────────────────────────

  info(message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    this.log('info', message, meta, tags)
  }

  warn(message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    this.log('warn', message, meta, tags)
  }

  error(message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    this.log('error', message, meta, tags)
  }

  debug(message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    this.log('debug', message, meta, tags)
  }

  verbose(message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    this.log('verbose', message, meta, tags)
  }

  trace(message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    this.log('trace', message, meta, tags)
  }

  // ─── send() method (overloads) ────────────────────────────────────────────────

  /**
   * send() accepts several forms:
   *   logger.send('my message')                          // uses defaultLevel
   *   logger.send('debug', 'my message')                 // explicit level
   *   logger.send({ level: 'error', message: '...', userId: '123' })  // structured
   */
  send(message: string): void
  send(level: LogLevel, message: string): void
  send(data: { level?: LogLevel; message?: string; tags?: string[];[key: string]: unknown }): void
  send(
    levelOrDataOrMsg: LogLevel | string | { level?: LogLevel; message?: string; tags?: string[];[key: string]: unknown },
    message?: string,
  ): void {
    if (typeof levelOrDataOrMsg === 'string' && message !== undefined) {
      // Form: send('debug', 'message')
      this.log(levelOrDataOrMsg as LogLevel, message)
    } else if (typeof levelOrDataOrMsg === 'string') {
      // Form: send('message') — uses defaultLevel
      this.log(this.defaultLevel ?? 'info', levelOrDataOrMsg)
    } else {
      const { level, message: msg, tags, ...meta } = levelOrDataOrMsg
      this.log(level ?? 'info', String(msg ?? ''), Object.keys(meta).length > 0 ? meta : undefined, tags)
    }
  }

  // ─── Direct HTTP send ─────────────────────────────────────────────────────────

  /**
   * Sends a payload to the Orion API via fetch.
   * @throws If the response is not ok (so the queue can retry)
   */
  private async httpSend(payload: LogPayload): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        level: payload.level,
        message: payload.message,
        ...(payload.meta ? { metadata: payload.meta } : {}),
        ...(payload.tags && payload.tags.length > 0 ? { tags: payload.tags } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`[Orion] Send failed: ${response.status} ${response.statusText}`)
    }
  }

  // ─── Core private method ──────────────────────────────────────────────────────

  /**
   * Builds the payload and attempts HTTP send.
   * On failure, enqueues if offline mode is active.
   * Fire & forget: never blocks the caller.
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>, tags?: string[]): void {
    const payload: LogPayload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    }

    this.httpSend(payload).catch(() => {
      if (this.offlineQueue) {
        this.offlineQueue.enqueue(payload)
      }
    })
  }

  // ─── Clean shutdown ───────────────────────────────────────────────────────────

  /**
   * Closes the queue and timers (call on app shutdown).
   *   process.on('SIGTERM', () => logger.close())
   */
  close(): void {
    this.offlineQueue?.close()
  }
}
