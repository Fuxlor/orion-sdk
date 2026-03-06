// ─── Niveaux de log ───────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'trace'

// ─── Payload d'un log envoyé à l'API ─────────────────────────────────────────

export interface LogPayload {
  level: LogLevel
  message: string
  timestamp: string     // ISO 8601
  meta?: Record<string, unknown>  // données structurées optionnelles
}

// ─── Config Orion (lue depuis orion.config.ts ou passée manuellement) ─────────

export interface OrionConfig {
  /** Token du projet, obtenu via orion-cli */
  token: string
  /** Nom du projet (ex: "my-app") */
  projectName: string
  /** Nom de la source (ex: "api-backend") */
  sourceName: string
  /** URL de l'API Orion (défaut: http://localhost:3001/api) */
  apiUrl?: string
  /** Active la queue offline si l'API est indisponible (défaut: true) */
  offline?: boolean
  /** Taille max de la queue offline (défaut: 1000) */
  maxQueueSize?: number
  /** Intervalle de retry en ms (défaut: 30000 = 30s) */
  retryInterval?: number
}

// ─── Options pour les middlewares (Express / Fastify) ─────────────────────────

export interface MiddlewareOptions {
  /** Logger les body de requête */
  logBody?: boolean
  /** Logger les headers */
  logHeaders?: boolean
  /** Routes à exclure du logging (ex: ['/health']) */
  exclude?: string[]
  /** Niveaux de log par catégorie de status HTTP */
  level?: {
    /** 2xx (défaut: 'info') */
    success?: LogLevel
    /** 4xx (défaut: 'warn') */
    clientError?: LogLevel
    /** 5xx (défaut: 'error') */
    serverError?: LogLevel
  }
}
