import { Logger } from './logger.js'
import { resolveConfig } from './config.js'
import type { OrionConfig, LogLevel } from './types.js'

// ─── Export des types publics ─────────────────────────────────────────────────
// L'utilisateur peut importer les types pour typer ses propres fonctions
export type { OrionConfig, LogLevel }
export type { LogPayload } from './types.js'

// ─── defineConfig ─────────────────────────────────────────────────────────────

/**
 * Helper pour typer orion.config.ts (comme defineConfig de Vite).
 *
 * Usage dans orion.config.ts :
 *   import { defineConfig } from 'orion'
 *   export default defineConfig({ token: '...', projectName: '...', sourceName: '...' })
 *
 * Cela n'a pas d'effet runtime — c'est uniquement pour l'autocomplétion TypeScript.
 */
export function defineConfig(config: OrionConfig): OrionConfig {
  return config
}

// ─── createLogger ─────────────────────────────────────────────────────────────

/**
 * Crée et retourne un Logger prêt à l'emploi.
 *
 * DEUX FAÇONS DE L'APPELER :
 *
 * 1. Auto-detect (orion.config.ts est trouvé automatiquement)
 *    const logger = createLogger()
 *
 * 2. Config explicite (override total ou partiel)
 *    const logger = createLogger({ token: '...', projectName: '...', sourceName: '...' })
 *
 * POURQUOI SYNCHRONE ?
 *   On a choisi de rendre createLogger() synchrone pour simplifier l'usage :
 *   pas besoin de top-level await, pas de .then() dans le code utilisateur.
 *
 *   La vérification du token est optionnelle et se fait séparément via verifyToken().
 *   La connexion WS est établie de façon lazy (seulement si le débit le justifie).
 *
 * @throws Si la config est incomplète (token/projectName/sourceName manquants)
 */
export function createLogger(override?: Partial<OrionConfig>): Logger {
  const config = resolveConfig(override)
  return new Logger(config)
}

/**
 * Crée un logger avec un niveau minimum pré-configuré.
 * Raccourci pratique depuis le cahier des charges :
 *
 *   const logger = Orion.createLogger('debug')
 *   → équivalent à createLogger() mais avec minLevel: 'debug'
 *
 * Note: on garde aussi createLogger(config) comme API principale.
 */
export const Orion = {
  createLogger(minLevel: LogLevel | Partial<OrionConfig> = 'debug'): Logger {
    if (typeof minLevel === 'string') {
      const config = resolveConfig()
      return new Logger({ ...config, minLevel } as any)
    }
    return createLogger(minLevel)
  }
}
