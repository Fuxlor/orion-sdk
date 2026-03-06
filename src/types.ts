// ─── Niveaux de log ───────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

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
  /** URL de l'API Orion (défaut: https://api.orion.dev) */
  apiUrl?: string
  /** Seuil en logs/sec pour basculer sur WebSocket (défaut: 10) */
  wsThreshold?: number
}

// ─── Interface d'un transport ─────────────────────────────────────────────────

export interface Transport {
  send(payload: LogPayload): Promise<void>
  close(): void
}
