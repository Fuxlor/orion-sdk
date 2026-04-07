import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import type { OrionConfig } from './types.js'

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULTS = {
  offline: true,
  maxQueueSize: 1000,
  retryInterval: 30_000,
} satisfies Partial<OrionConfig>

// ─── Config file lookup ───────────────────────────────────────────────────────

function getScriptDir(): string {
  const script = process.argv[1]
  if (script) return dirname(resolve(script))
  return process.cwd()
}

function findConfigFile(startDir: string): string | null {
  let current = startDir

  while (true) {
    const candidate = join(current, '.orion/config.json')
    if (existsSync(candidate)) return candidate

    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

// ─── resolveConfig ────────────────────────────────────────────────────────────

/**
 * Resolves the final configuration by merging:
 * 1. Default values
 * 2. Auto-detected config from .orion/config.json (if present and no token override)
 * 3. Manual override passed by the user (highest priority)
 *
 * @throws If token is missing after merge
 */
export function resolveConfig(override?: Partial<OrionConfig>): OrionConfig {
  let fileConfig: Partial<OrionConfig> = {}

  if (!override?.token) {
    const configPath = findConfigFile(getScriptDir())
    if (configPath) {
      try {
        fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
      } catch (err) {
        console.warn(`[Orion] Could not read ${configPath}:`, err)
      }
    }
  }

  const config = { ...DEFAULTS, ...fileConfig, ...override }

  if (!config.token) {
    throw new Error(
      `[Orion] Missing token.\n` +
      `  → Run "npx orion-setup" to generate .orion/config.json, or pass it manually:\n` +
      `  → createLogger({ token: '...' })`
    )
  }

  return config as OrionConfig
}
