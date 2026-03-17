import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { OrionConfig } from './types.js'

// ─── Default values ───────────────────────────────────────────────────────────

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
 * Helper to type orion.config.ts (like Vite's defineConfig).
 *
 * Usage in orion.config.ts:
 *   import { defineConfig } from '@orion-monitoring/sdk'
 *   export default defineConfig({ token: '...' })
 */
export function defineConfig(config: OrionConfig): OrionConfig {
  return config
}

// ─── Config file lookup ───────────────────────────────────────────────────────

/**
 * Walks up the directory tree from `startDir` to find orion.config.ts.
 * Same behavior as Vite, ESLint, Prettier.
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

// ─── Naive config file parsing ────────────────────────────────────────────────

/**
 * Extracts fields from the raw content of orion.config.ts.
 * Regex-based parsing to stay lightweight (no ts-node/tsx dependency).
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
 * Loads the Orion configuration by searching for orion.config.ts from process.cwd()
 * and walking up the directory tree.
 *
 * @throws If the orion.config.ts file is not found
 */
export function loadConfig(): OrionConfig {
  const configPath = findConfigFile(process.cwd())

  if (!configPath) {
    throw new Error(
      `[Orion] orion.config.ts not found.\n` +
      `  → Run "npx @orion-monitoring/cli" to generate the configuration.\n` +
      `  → Searched from: ${process.cwd()}`
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

  // Validate required fields
  if (!config.token) {
    throw new Error(
      `[Orion] Incomplete configuration in ${configPath}, missing field: token.`
    )
  }

  return config as OrionConfig
}

// ─── resolveConfig ────────────────────────────────────────────────────────────

/**
 * Resolves the final configuration by merging:
 * 1. Default values (DEFAULTS)
 * 2. Auto-detected config from orion.config.ts (if present)
 * 3. Manual override passed by the user (highest priority)
 *
 * @param override - Partial config passed directly by the user
 * @throws If token/projectName/sourceName are missing after merge
 */
export function resolveConfig(override?: Partial<OrionConfig>): OrionConfig {
  let fileConfig: Partial<OrionConfig> = {}

  const needsAutoDetect = !override?.token

  if (needsAutoDetect) {
    const configPath = findConfigFile(process.cwd())
    if (configPath) {
      try {
        fileConfig = parseConfigFile(configPath)
      } catch (err) {
        console.warn(`[Orion] Could not read ${configPath}:`, err)
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

  if (!config.token) {
    throw new Error(
      `[Orion] Incomplete configuration, missing field: token.\n` +
      `  → Run "npx @orion-monitoring/cli" to generate orion.config.ts, or pass the config manually:\n` +
      `  → createLogger({ token: '...' })`
    )
  }

  return config as OrionConfig
}
