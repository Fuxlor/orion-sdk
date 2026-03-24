// ─── Exports publics du SDK Orion ─────────────────────────────────────────────

// Types
export type { LogLevel, LogPayload, OrionConfig, MiddlewareOptions } from './types.js'

// Config
export { resolveConfig } from './config.js'

// Logger
export { Logger } from './logger.js'

// Queue
export { OfflineQueue } from './queue.js'

// Middlewares
export { createOrionMiddleware } from './middlewares/express.js'
export { orionPlugin } from './middlewares/fastify.js'

// ─── createLogger (factory) ──────────────────────────────────────────────────

import { Logger } from './logger.js'
import { resolveConfig } from './config.js'
import type { OrionConfig, LogLevel } from './types.js'

/**
 * Creates and returns a ready-to-use Logger.
 *
 * TWO WAYS TO CALL IT:
 *
 * 1. Auto-detect (orion.config.ts is found automatically)
 *    const logger = createLogger()
 *
 * 2. Explicit config (full or partial override)
 *    const logger = createLogger({ token: '...', projectName: '...', sourceName: '...' })
 */
export function createLogger(override?: Partial<OrionConfig>): Logger {
  const config = resolveConfig(override)
  return new Logger(config)
}

// ─── Orion namespace ─────────────────────────────────────────────────────────

/**
 * Namespace Orion avec raccourcis pratiques.
 *
 * UTILISATION :
 *   const logger = Orion.createLogger('debug')
 *   logger.send('mon message')   // → envoie en level 'debug'
 */
export const Orion = {
  createLogger(levelOrConfig?: LogLevel | Partial<OrionConfig>): Logger {
    if (typeof levelOrConfig === 'string') {
      const config = resolveConfig()
      return new Logger(config, levelOrConfig)
    }
    return createLogger(levelOrConfig)
  },
}
