import { OfflineQueue } from './queue.js'
import { PerformanceLoggingThread } from './performance.js'
import type { LogLevel, LogPayload, OrionConfig } from './types.js'

/**
 * Logger — l'objet que l'utilisateur manipule au quotidien.
 *
 * UTILISATION :
 *   const logger = await createLogger()
 *   logger.info('Serveur démarré')
 *   logger.error('Connexion BDD échouée')
 *   logger.send('warn', 'Rate limit atteint')
 *   logger.send({ level: 'debug', message: 'Request reçue', userId: '123' })
 * 
 *   const logger = Orion.createLogger('debug')
 *   logger.send('Serveur démarré')
 *
 * ENVOI :
 *   Chaque log est envoyé via un POST HTTP (fetch natif).
 *   Si l'API est indisponible et que le mode offline est activé,
 *   les logs sont mis en queue et réenvoyés automatiquement.
 */
export class Logger {
  private readonly url: string
  private readonly headers: Record<string, string>
  private readonly offlineEnabled: boolean
  private readonly offlineQueue: OfflineQueue | null
  private readonly defaultLevel: LogLevel | null
  private readonly performanceEnabled: boolean
  private readonly performanceLoggingThread: PerformanceLoggingThread | null

  constructor(private readonly config: OrionConfig, defaultLevel?: LogLevel) {
    this.defaultLevel = defaultLevel ?? null
    this.url = `http://localhost:3001/api/projects/${config.projectName}/sources/${config.sourceName}/logs/emit`

    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    }

    this.offlineEnabled = config.offline !== false
    this.offlineQueue = this.offlineEnabled
      ? new OfflineQueue(config, (payload) => this.httpSend(payload))
      : null
    this.performanceEnabled = config.performance !== false
    this.performanceLoggingThread = this.performanceEnabled ? new PerformanceLoggingThread(config) : null
  }

  // ─── Méthodes par niveau ──────────────────────────────────────────────────────

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta)
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta)
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta)
  }

  verbose(message: string, meta?: Record<string, unknown>): void {
    this.log('verbose', message, meta)
  }

  trace(message: string, meta?: Record<string, unknown>): void {
    this.log('trace', message, meta)
  }

  // ─── Méthode send (surcharge) ─────────────────────────────────────────────────

  /**
   * send() accepte plusieurs formes :
   *   logger.send('mon message')                         // utilise le defaultLevel
   *   logger.send('debug', 'mon message')                // niveau explicite
   *   logger.send({ level: 'error', message: '...', userId: '123' })  // structuré
   */
  send(message: string): void
  send(level: LogLevel, message: string): void
  send(data: { level?: LogLevel; message?: string; [key: string]: unknown }): void
  send(
    levelOrDataOrMsg: LogLevel | string | { level?: LogLevel; message?: string; [key: string]: unknown },
    message?: string,
  ): void {
    if (typeof levelOrDataOrMsg === 'string' && message !== undefined) {
      // Forme : send('debug', 'message')
      this.log(levelOrDataOrMsg as LogLevel, message)
    } else if (typeof levelOrDataOrMsg === 'string') {
      // Forme : send('message') — utilise le defaultLevel
      this.log(this.defaultLevel ?? 'info', levelOrDataOrMsg)
    } else {
      const { level, message: msg, ...meta } = levelOrDataOrMsg
      this.log(level ?? 'info', String(msg ?? ''), Object.keys(meta).length > 0 ? meta : undefined)
    }
  }

  // ─── Envoi HTTP direct ────────────────────────────────────────────────────────

  /**
   * Envoie un payload à l'API Orion via fetch.
   * @throws Si la réponse n'est pas ok (pour que la queue puisse réessayer)
   */
  private async httpSend(payload: LogPayload): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        level: payload.level,
        message: payload.message,
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`[Orion] Échec de l'envoi : ${response.status} ${response.statusText}`)
    }
  }

  // ─── Méthode privée centrale ──────────────────────────────────────────────────

  /**
   * Construit le payload et tente l'envoi HTTP.
   * En cas d'échec, enqueue si le mode offline est actif.
   * Fire & forget : ne bloque jamais l'appelant.
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const payload: LogPayload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    }

    this.httpSend(payload).catch(() => {
      if (this.offlineQueue) {
        this.offlineQueue.enqueue(payload)
      }
    })
  }

  // ─── Fermeture propre ─────────────────────────────────────────────────────────

  /**
   * Ferme la queue et les timers (à appeler en shutdown de l'app).
   *   process.on('SIGTERM', () => logger.close())
   */
  close(): void {
    this.offlineQueue?.close()
  }
}
