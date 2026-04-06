import type { Logger } from '../logger.js'
import type { LogLevel, MiddlewareOptions } from '../types.js'
import { resolveConfig } from '../config.js'

/**
 * Express middleware for automatic HTTP request logging.
 *
 * USAGE:
 *   import { createOrionMiddleware } from 'orion/middlewares/express'
 *
 *   app.use(await createOrionMiddleware({
 *     exclude: ['/health'],
 *     level: { success: 'info', clientError: 'warn', serverError: 'error' }
 *   }))
 *
 * Automatically logs: "GET /api/v1/users 200 — 23ms"
 */

// Minimal types to avoid a direct dependency on express
interface ExpressRequest {
  method: string
  originalUrl: string
  url: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}

interface ExpressResponse {
  statusCode: number
  on(event: string, listener: (...args: unknown[]) => void): void
}

type NextFunction = (err?: unknown) => void
type ExpressMiddleware = (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void

/**
 * Creates an Express middleware that logs each request with duration and status code.
 */
export async function createOrionMiddleware(options?: MiddlewareOptions): Promise<ExpressMiddleware> {
  // Dynamic import of Logger to avoid circular dependency issues
  const { Logger } = await import('../logger.js')
  const config = resolveConfig()
  const logger = new Logger(config)

  const exclude = options?.exclude ?? []
  const levels = {
    success: options?.level?.success ?? 'info',
    clientError: options?.level?.clientError ?? 'warn',
    serverError: options?.level?.serverError ?? 'error',
  }

  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    const path = req.originalUrl || req.url

    // Check if the route is excluded
    if (exclude.some((pattern) => path.startsWith(pattern))) {
      next()
      return
    }

    const start = Date.now()

    res.on('finish', () => {
      const duration = Date.now() - start
      const status = res.statusCode
      const method = req.method
      const message = `${method} ${path} ${status} — ${duration}ms`

      // Determine the log level based on the status code
      let level: LogLevel = levels.success
      if (status >= 500) {
        level = levels.serverError
      } else if (status >= 400) {
        level = levels.clientError
      }

      const meta: Record<string, unknown> = {
        method,
        path,
        statusCode: status,
        duration,
      }

      if (options?.logBody && req.body) {
        meta.body = req.body
      }

      if (options?.logHeaders) {
        meta.headers = req.headers
      }

      logger.send({ level, message, ...meta })
    })

    next()
  }
}
