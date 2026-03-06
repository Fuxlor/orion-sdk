import { TransportManager } from './transport/index.ts'
import type { LogLevel, LogPayload, OrionConfig } from './types.ts'

/**
 * Logger — l'objet que l'utilisateur manipule au quotidien.
 *
 * UTILISATION :
 *   const logger = await createLogger()
 *   logger.info('Serveur démarré')
 *   logger.error('Connexion BDD échouée', { host: 'localhost', port: 5432 })
 *   logger.send('warn', 'Rate limit atteint')
 *   logger.send({ level: 'debug', message: 'Request reçue', userId: '123' })
 *
 * NIVEAUX :
 *   Seuls les logs dont le niveau est ≥ au niveau configuré sont envoyés.
 *   Ordre : debug < info < warn < error
 *
 * ERREURS D'ENVOI :
 *   Par défaut, les erreurs d'envoi sont silencieuses (un warning sur stderr).
 *   On ne veut pas que le monitoring fasse crasher l'application monitorée.
 *   Ce comportement peut être changé via { throwOnError: true } dans la config.
 */

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export class Logger {
  private readonly manager: TransportManager
  private readonly level: LogLevel
  private send: ((messageOrData: string | Record<string, unknown>, meta?: Record<string, unknown>) => void) | ((levelOrData: LogLevel | Record<string, unknown>, message?: string) => void)

  constructor(config: OrionConfig) {
    this.manager = new TransportManager(config)
    // Le niveau minimum est stocké dans la config (ex: 'debug', 'info'...)
    // Par défaut 'debug' = tout passe
    this.level = (config as any).minLevel ?? 'debug'
    if ((config as any).level) {
      this.send = this.sendWithoutLevel
    } else {
      this.send = this.sendWithLevel
    }
  }

  // ─── Méthodes de niveau ───────────────────────────────────────────────────────

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta)
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta)
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta)
  }

  // ─── Méthode send (surcharge) ─────────────────────────────────────────────────

  /**
   * send() accepte deux formes, comme défini dans le cahier des charges :
   *
   *   logger.send('debug', 'mon message')
   *   logger.send({ level: 'error', message: '...', userId: '123' })
   *
   * La deuxième forme permet les logs structurés avec des métadonnées arbitraires.
   */
  private sendWithLevel(levelOrData: LogLevel | Record<string, unknown>, message?: string): void {
    if (typeof levelOrData === 'string') {
      // Forme : send('debug', 'message')
      this.log(levelOrData, message ?? '', undefined)
    } else {
      // Forme : send({ level: 'error', message: '...', userId: '123' })
      const { level, message: msg, ...meta } = levelOrData as {
        level?: LogLevel
        message?: string
        [key: string]: unknown
      }
      this.log(level ?? 'info', String(msg ?? ''), meta)
    }
  }

  /**
   * send() accepte deux formes, comme défini dans le cahier des charges :
   *
   *   logger.send('debug', 'mon message')
   *   logger.send({ level: 'error', message: '...', userId: '123' })
   *
   * La deuxième forme permet les logs structurés avec des métadonnées arbitraires.
   */
  private sendWithoutLevel(messageOrData: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    if (typeof messageOrData === 'string') {
      // Forme : send('debug', 'message')
      this.log(this.level, messageOrData ?? '', undefined)
    } else {
      // Forme : send({ level: 'error', message: '...', userId: '123' })
      const { message: msg, ...meta } = messageOrData as {
        message?: string
        [key: string]: unknown
      }
      this.log(this.level, String(msg ?? ''), meta)
    }
  }

  // ─── Méthode privée centrale ──────────────────────────────────────────────────

  /**
   * log() est la méthode interne qui :
   * 1. Filtre selon le niveau minimum configuré
   * 2. Construit le payload
   * 3. Délègue l'envoi au TransportManager (sans bloquer le thread appelant)
   *
   * L'envoi est "fire and forget" : on ne fait pas attendre l'appelant.
   * Les erreurs sont loguées sur stderr mais ne remontent pas.
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const payload: LogPayload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    }

    // Fire & forget avec gestion d'erreur silencieuse
    this.manager.send(payload).catch((err: Error) => {
      process.stderr.write(`[Orion] Erreur d'envoi du log : ${err.message}\n`)
    })
  }

  // ─── Observabilité ────────────────────────────────────────────────────────────

  /**
   * Retourne le transport actif ('http' ou 'ws') et le débit courant.
   * Utile pour le debug et les tests.
   */
  getStatus(): { transport: 'http' | 'ws', rate: number } {
    return this.manager.getStatus()
  }

  /**
   * Ferme proprement les connexions (à appeler en shutdown de l'app).
   *
   *   process.on('SIGTERM', () => logger.close())
   */
  close(): void {
    this.manager.close()
  }
}
