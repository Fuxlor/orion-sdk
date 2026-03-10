import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { OrionConfig } from './types.js'

// ─── Valeurs par défaut ───────────────────────────────────────────────────────

const DEFAULTS = {
  offline: true,
  maxQueueSize: 1000,
  retryInterval: 30_000,
  performance: false,
  performanceInterval: 60_000,
  heartbeat: true,
  heartbeatInterval: 30_000,
} satisfies Partial<OrionConfig>

// ─── defineConfig ─────────────────────────────────────────────────────────────

/**
 * Helper pour typer orion.config.ts (comme defineConfig de Vite).
 *
 * Usage dans orion.config.ts :
 *   import { defineConfig } from 'orion'
 *   export default defineConfig({ token: '...', projectName: '...', sourceName: '...' })
 */
export function defineConfig(config: OrionConfig): OrionConfig {
  return config
}

// ─── Recherche du fichier de config ───────────────────────────────────────────

/**
 * Remonte l'arborescence à partir de `startDir` pour trouver orion.config.ts.
 * Même comportement que Vite, ESLint, Prettier.
 */
function findConfigFile(startDir: string): string | null {
  let current = startDir

  while (true) {
    const candidate = join(current, 'orion.config.ts')
    if (existsSync(candidate)) return candidate

    const candidateJs = join(current, 'orion.config.js')
    if (existsSync(candidateJs)) return candidateJs

    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

// ─── Parsing naïf du fichier de config ────────────────────────────────────────

/**
 * Extrait les champs depuis le contenu brut du fichier orion.config.ts.
 * Parsing regex pour rester léger (pas de dépendance à ts-node/tsx).
 */
function parseConfigFile(filePath: string): Partial<OrionConfig> {
  const content = readFileSync(filePath, 'utf-8')

  const extract = (key: string): string | undefined => {
    const match = content.match(new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`))
    return match?.[1]
  }

  const extractNum = (key: string): number | undefined => {
    const match = content.match(new RegExp(`${key}\\s*:\\s*(\\d+)`))
    return match ? parseInt(match[1], 10) : undefined
  }

  const extractBool = (key: string): boolean | undefined => {
    const match = content.match(new RegExp(`${key}\\s*:\\s*(true|false)`))
    return match ? match[1] === 'true' : undefined
  }

  return {
    token: extract('token'),
    projectName: extract('projectName'),
    sourceName: extract('sourceName'),
    offline: extractBool('offline'),
    maxQueueSize: extractNum('maxQueueSize'),
    retryInterval: extractNum('retryInterval'),
    performance: extractBool('performance'),
    performanceInterval: extractNum('performanceInterval'),
    performanceCustomMessage: extract('performanceCustomMessage'),
    heartbeat: extractBool('heartbeat'),
    heartbeatInterval: extractNum('heartbeatInterval'),
  }
}

// ─── loadConfig ───────────────────────────────────────────────────────────────

/**
 * Charge la configuration Orion en cherchant orion.config.ts depuis process.cwd()
 * et en remontant l'arborescence.
 *
 * @throws Si le fichier orion.config.ts est introuvable
 */
export function loadConfig(): OrionConfig {
  const configPath = findConfigFile(process.cwd())

  if (!configPath) {
    throw new Error(
      `[Orion] Fichier orion.config.ts introuvable.\n` +
      `  → Lancez "npx @orion-monitoring/cli" pour générer la configuration.\n` +
      `  → Cherché depuis : ${process.cwd()}`
    )
  }

  const fileConfig = parseConfigFile(configPath)
  const config = { ...DEFAULTS, ...fileConfig }

  if (config.performanceInterval && config.performanceInterval < 10000) {
    config.performanceInterval = 10000
  }

  if (config.heartbeatInterval && config.heartbeatInterval < 30000) {
    config.heartbeatInterval = 30000
  }

  // Validation des champs obligatoires
  const missing: string[] = []
  if (!config.token) missing.push('token')
  if (!config.projectName) missing.push('projectName')
  if (!config.sourceName) missing.push('sourceName')

  if (missing.length > 0) {
    throw new Error(
      `[Orion] Configuration incomplète dans ${configPath}, champs manquants : ${missing.join(', ')}.`
    )
  }

  return config as OrionConfig
}

// ─── resolveConfig ────────────────────────────────────────────────────────────

/**
 * Résout la configuration finale en fusionnant :
 * 1. Les valeurs par défaut (DEFAULTS)
 * 2. La config auto-détectée depuis orion.config.ts (si présente)
 * 3. L'override manuel passé par l'utilisateur (priorité maximale)
 *
 * @param override - Config partielle passée directement par l'utilisateur
 * @throws Si token/projectName/sourceName sont manquants après fusion
 */
export function resolveConfig(override?: Partial<OrionConfig>): OrionConfig {
  let fileConfig: Partial<OrionConfig> = {}

  const needsAutoDetect = !override?.token || !override?.projectName || !override?.sourceName

  if (needsAutoDetect) {
    const configPath = findConfigFile(process.cwd())
    if (configPath) {
      try {
        fileConfig = parseConfigFile(configPath)
      } catch (err) {
        console.warn(`[Orion] Impossible de lire ${configPath} :`, err)
      }
    }
  }

  const config = { ...fileConfig, ...override }
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined && key in DEFAULTS) {
      (config as Record<string, unknown>)[key] = DEFAULTS[key as keyof typeof DEFAULTS]
    }
  }

  if (config.performanceInterval && config.performanceInterval < 10000) {
    config.performanceInterval = 10000
  }

  if (config.heartbeatInterval && config.heartbeatInterval < 30000) {
    config.heartbeatInterval = 30000
  }

  const missing: string[] = []
  if (!config.token) missing.push('token')
  if (!config.projectName) missing.push('projectName')
  if (!config.sourceName) missing.push('sourceName')

  if (missing.length > 0) {
    throw new Error(
      `[Orion] Configuration incomplète, champs manquants : ${missing.join(', ')}.\n` +
      `  → Lancez "npx orion-cli init" pour générer orion.config.ts, ou passez la config manuellement :\n` +
      `  → createLogger({ token: '...', projectName: '...', sourceName: '...' })`
    )
  }

  return config as OrionConfig
}
