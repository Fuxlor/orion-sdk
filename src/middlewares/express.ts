import type { Logger } from '../logger.js'
import type { LogLevel, MiddlewareOptions } from '../types.js'
import { resolveConfig } from '../config.js'

/**
 * Middleware Express pour logger automatiquement les requêtes HTTP.
 *
 * UTILISATION :
 *   import { createOrionMiddleware } from 'orion/middlewares/express'
 *
 *   app.use(await createOrionMiddleware({
 *     exclude: ['/health'],
 *     level: { success: 'info', clientError: 'warn', serverError: 'error' }
 *   }))
 *
 * Logue automatiquement : "GET /api/users 200 — 23ms"
 */

// Types minimaux pour éviter de dépendre directement d'express
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
 * Crée un middleware Express qui logue chaque requête avec durée et status code.
 */
export async function createOrionMiddleware(options?: MiddlewareOptions): Promise<ExpressMiddleware> {
  // Import dynamique du Logger pour éviter les problèmes de dépendances circulaires
  const { Logger } = await import('../logger.js')
  const { getHeartbeatThread } = await import('../heartbeat.js')
  const config = resolveConfig()
  const logger = new Logger(config)

  if (config.heartbeat !== false) {
    getHeartbeatThread(config)
  }

  const exclude = options?.exclude ?? []
  const levels = {
    success: options?.level?.success ?? 'info',
    clientError: options?.level?.clientError ?? 'warn',
    serverError: options?.level?.serverError ?? 'error',
  }

  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    const path = req.originalUrl || req.url

    // Vérifie si la route est exclue
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

      // Détermine le niveau selon le status code
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
