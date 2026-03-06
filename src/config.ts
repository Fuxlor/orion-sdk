import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { OrionConfig } from './types.js'

/**
 * Valeurs par défaut pour la config.
 * L'utilisateur n'a à renseigner que ce qui est obligatoire (token, projectName, sourceName).
 */
const DEFAULTS = {
  apiUrl: 'http://localhost:3000/api',   // à changer en prod
  wsThreshold: 10,                        // logs/sec avant de basculer en WS
} satisfies Partial<OrionConfig>

/**
 * Remonte l'arborescence à partir de `startDir` pour trouver orion.config.ts.
 *
 * Pourquoi remonter ? Même comportement que Vite, ESLint, Prettier :
 * peu importe depuis quel sous-dossier le process est lancé, on trouve la config
 * à la racine du projet.
 *
 * On s'arrête à la racine du système de fichiers (dirname('/') === '/').
 */
function findConfigFile(startDir: string): string | null {
  let current = startDir

  while (true) {
    const candidate = join(current, 'orion.config.ts')
    if (existsSync(candidate)) return candidate

    // Aussi chercher orion.config.js (si projet non-TypeScript)
    const candidateJs = join(current, 'orion.config.js')
    if (existsSync(candidateJs)) return candidateJs

    const parent = dirname(current)
    if (parent === current) return null   // on est à la racine du FS, pas trouvé
    current = parent
  }
}

/**
 * Extrait le token et les champs de config depuis le contenu brut du fichier.
 *
 * On utilise du parsing regex "naïf" plutôt qu'un vrai parseur TypeScript
 * pour rester léger (pas de dépendance à ts-node/tsx au runtime).
 *
 * Cette approche fonctionne pour le format généré par orion-cli.
 * Si l'utilisateur a une config complexe, il utilisera l'override manuel.
 */
function parseConfigFile(filePath: string): Partial<OrionConfig> {
  const content = readFileSync(filePath, 'utf-8')

  // Extrait les paires clé: 'valeur' ou clé: "valeur"
  const extract = (key: string): string | undefined => {
    const match = content.match(new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`))
    return match?.[1]
  }

  const extractNum = (key: string): number | undefined => {
    const match = content.match(new RegExp(`${key}\\s*:\\s*(\\d+)`))
    return match ? parseInt(match[1], 10) : undefined
  }

  return {
    token: extract('token'),
    projectName: extract('projectName'),
    sourceName: extract('sourceName'),
    wsThreshold: extractNum('wsThreshold'),
  }
}

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

  // Auto-detect uniquement si l'utilisateur n'a pas tout fourni manuellement
  const needsAutoDetect = !override?.token || !override?.projectName || !override?.sourceName

  if (needsAutoDetect) {
    const configPath = findConfigFile(process.cwd())
    if (configPath) {
      try {
        fileConfig = parseConfigFile(configPath)
      } catch (err) {
        // On ne plante pas si le parsing échoue, on laisse l'utilisateur voir l'erreur de validation
        console.warn(`[Orion] Impossible de lire ${configPath} :`, err)
      }
    }
  }

  // Fusion : defaults < fichier < override manuel
  const config = {
    ...DEFAULTS,
    ...fileConfig,
    ...override,
  }

  // Validation des champs obligatoires
  const missing: string[] = []
  if (!config.token) missing.push('token')
  if (!config.projectName) missing.push('projectName')
  if (!config.sourceName) missing.push('sourceName')

  if (missing.length > 0) {
    throw new Error(
      `[Orion] Configuration incomplète, champs manquants : ${missing.join(', ')}.\n` +
      `  → Lance "npx orion-cli" pour générer orion.config.ts, ou passe la config manuellement :\n` +
      `  → createLogger({ token: '...', projectName: '...', sourceName: '...' })`
    )
  }

  return config as OrionConfig
}
