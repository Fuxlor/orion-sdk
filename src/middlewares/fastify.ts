import type { Logger } from '../logger.js'
import type { LogLevel, MiddlewareOptions } from '../types.js'
import { resolveConfig } from '../config.js'

/**
 * Fastify plugin for automatic HTTP request logging.
 *
 * USAGE:
 *   import { orionPlugin } from 'orion/middlewares/fastify'
 *
 *   await fastify.register(orionPlugin, { exclude: ['/health'] })
 *
 * Uses onRequest / onResponse hooks to capture duration + status.
 */

// Minimal types to avoid a direct dependency on fastify
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
 * Fastify plugin for automatic request logging.
 */
export async function orionPlugin(
  fastify: FastifyInstance,
  options: FastifyPluginOptions,
): Promise<void> {
  const { Logger } = await import('../logger.js')
  const config = resolveConfig()
  const logger = new Logger(config)

  const exclude = options?.exclude ?? []
  const levels = {
    success: options?.level?.success ?? 'info',
    clientError: options?.level?.clientError ?? 'warn',
    serverError: options?.level?.serverError ?? 'error',
  }

  // onRequest hook: records the start timestamp
  fastify.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done: (err?: Error) => void) => {
    request.orionStartTime = Date.now()
    done()
  })

  // onResponse hook: logs the request with duration and status
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

  // onError hook: logs uncaught errors
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
