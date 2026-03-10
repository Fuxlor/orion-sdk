import type { Logger } from '../logger.js'
import type { LogLevel, MiddlewareOptions } from '../types.js'
import { resolveConfig } from '../config.js'

/**
 * Plugin Fastify pour logger automatiquement les requêtes HTTP.
 *
 * UTILISATION :
 *   import { orionPlugin } from 'orion/middlewares/fastify'
 *
 *   await fastify.register(orionPlugin, { exclude: ['/health'] })
 *
 * Utilise les hooks onRequest / onResponse pour capturer durée + status.
 */

// Types minimaux pour éviter de dépendre directement de fastify
interface FastifyRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  orionStartTime?: number
}

interface FastifyReply {
  statusCode: number
}

interface FastifyInstance {
  addHook(hook: 'onRequest', handler: (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => void): void
  addHook(hook: 'onResponse', handler: (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => void): void
  addHook(hook: 'onError', handler: (request: FastifyRequest, reply: FastifyReply, error: Error, done: () => void) => void): void
}

interface FastifyPluginOptions extends MiddlewareOptions {}

/**
 * Plugin Fastify pour le logging automatique des requêtes.
 */
export async function orionPlugin(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
): Promise<void> {
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

  // Hook onRequest : enregistre le timestamp de début
  fastify.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
    request.orionStartTime = Date.now()
    done()
  })

  // Hook onResponse : logue la requête avec durée et status
  fastify.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    const path = request.url

    if (exclude.some((pattern) => path.startsWith(pattern))) {
      done()
      return
    }

    const duration = Date.now() - (request.orionStartTime ?? Date.now())
    const status = reply.statusCode
    const method = request.method
    const message = `${method} ${path} ${status} — ${duration}ms`

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

    if (options?.logBody && request.body) {
      meta.body = request.body
    }

    if (options?.logHeaders) {
      meta.headers = request.headers
    }

    logger.send({ level, message, ...meta })
    done()
  })

  // Hook onError : logue les erreurs non attrapées
  fastify.addHook('onError', (request: FastifyRequest, _reply: FastifyReply, error: Error, done: () => void) => {
    const path = request.url

    if (exclude.some((pattern) => path.startsWith(pattern))) {
      done()
      return
    }

    const duration = Date.now() - (request.orionStartTime ?? Date.now())
    const message = `${request.method} ${path} ERROR — ${duration}ms — ${error.message}`

    logger.send({
      level: 'error',
      message,
      method: request.method,
      path,
      duration,
      error: error.message,
      stack: error.stack,
    })

    done()
  })
}
