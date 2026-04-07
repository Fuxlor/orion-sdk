// ─── Log levels ───────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'trace' | 'fatal'

// ─── Log payload sent to the API ─────────────────────────────────────────────

export interface LogPayload {
  level: LogLevel
  message: string
  timestamp: string     // ISO 8601
  meta?: Record<string, unknown>  // optional structured data
  tags?: string[]                 // optional tags
}

// ─── Orion config (read from orion.config.ts or passed manually) ──────────────

export interface OrionConfig {
  /** Project token, obtained via orion-cli */
  token: string
  /** @deprecated Project name — no longer needed when using a source-bound token */
  projectName?: string
  /** @deprecated Source name — no longer needed when using a source-bound token */
  sourceName?: string
  /** Orion API URL (default: http://localhost:3001/api) */
  apiUrl?: string
  /** Enable offline queue if the API is unavailable (default: true) */
  offline?: boolean
  /** Max offline queue size (default: 1000) */
  maxQueueSize?: number
  /** Retry interval in ms (default: 30000 = 30s) */
  retryInterval?: number
  /** Called when a log is dropped because the offline queue is full */
  onDrop?: (dropped: LogPayload) => void
}

// ─── Middleware options (Express / Fastify) ───────────────────────────────────

export interface MiddlewareOptions {
  /** Log request bodies */
  logBody?: boolean
  /** Log request headers */
  logHeaders?: boolean
  /** Routes to exclude from logging (e.g. ['/health']) */
  exclude?: string[]
  /** Log levels per HTTP status category */
  level?: {
    /** 2xx (default: 'info') */
    success?: LogLevel
    /** 4xx (default: 'warn') */
    clientError?: LogLevel
    /** 5xx (default: 'error') */
    serverError?: LogLevel
  }
}
