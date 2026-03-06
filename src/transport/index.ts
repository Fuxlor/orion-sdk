import { HttpTransport } from './http.js'
import { WebSocketTransport } from './websocket.js'
import type { Transport, LogPayload, OrionConfig } from '../types.js'

/**
 * TransportManager — choisit et switche le transport selon le débit observé.
 *
 * LOGIQUE DE DÉCISION :
 *
 *   débit < wsThreshold  →  HTTP  (simple, léger, sans connexion)
 *   débit ≥ wsThreshold  →  WS    (persistant, efficace sous charge)
 *
 * Le débit est mesuré sur une fenêtre glissante d'1 seconde.
 * On ne switche pas à chaque log pour éviter l'oscillation ("flapping") :
 * un hysteresis de 2s est appliqué avant de redescendre vers HTTP.
 *
 * CYCLE DE VIE :
 *   - HTTP est toujours disponible (pas d'état à gérer)
 *   - WS est instancié à la demande et fermé si on revient en HTTP
 *     (après une période d'inactivité sous le seuil)
 */
export class TransportManager {
  private readonly config: OrionConfig
  private readonly threshold: number   // logs/sec pour basculer

  // Transports
  private httpTransport: HttpTransport
  private wsTransport: WebSocketTransport | null = null
  private activeTransport: Transport

  // Mesure du débit : sliding window d'1s
  private logTimestamps: number[] = []   // timestamps des logs récents (ms)
  private readonly WINDOW_MS = 1000      // fenêtre de mesure
  private hysteresisTimer: NodeJS.Timeout | null = null
  private readonly HYSTERESIS_MS = 2000  // délai avant de repasser en HTTP

  constructor(config: OrionConfig) {
    this.config = config
    this.threshold = config.wsThreshold ?? 10
    this.httpTransport = new HttpTransport(config)
    this.activeTransport = this.httpTransport   // HTTP par défaut
  }

  // ─── Envoi principal ──────────────────────────────────────────────────────────

  async send(payload: LogPayload): Promise<void> {
    this.recordLog()
    const transport = this.selectTransport()
    await transport.send(payload)
  }

  // ─── Mesure du débit ──────────────────────────────────────────────────────────

  /**
   * Enregistre le timestamp du log courant et nettoie les anciens
   * pour maintenir uniquement la fenêtre d'1 seconde.
   */
  private recordLog(): void {
    const now = Date.now()
    this.logTimestamps.push(now)
    // Supprime les timestamps hors de la fenêtre
    const cutoff = now - this.WINDOW_MS
    this.logTimestamps = this.logTimestamps.filter(t => t > cutoff)
  }

  /**
   * Retourne le nombre de logs dans la fenêtre d'1 seconde = logs/sec courant.
   */
  private currentRate(): number {
    const cutoff = Date.now() - this.WINDOW_MS
    return this.logTimestamps.filter(t => t > cutoff).length
  }

  // ─── Sélection du transport ───────────────────────────────────────────────────

  /**
   * Décide quel transport utiliser selon le débit observé.
   *
   * → Montée en charge : dès que le seuil est dépassé, on bascule sur WS
   *   et on instancie le WebSocketTransport si ce n'est pas déjà fait.
   *
   * → Descente : on attend HYSTERESIS_MS avant de fermer WS et revenir HTTP.
   *   Cela évite de créer/détruire des connexions WS si le débit oscille
   *   autour du seuil.
   */
  private selectTransport(): Transport {
    const rate = this.currentRate()

    if (rate >= this.threshold) {
      // Fort volume → WebSocket
      if (!this.wsTransport) {
        this.wsTransport = new WebSocketTransport(this.config)
      }

      // Annule le timer de descente si on repasse au-dessus du seuil
      if (this.hysteresisTimer) {
        clearTimeout(this.hysteresisTimer)
        this.hysteresisTimer = null
      }

      this.activeTransport = this.wsTransport
    } else if (this.activeTransport === this.wsTransport) {
      // On est sous le seuil mais on utilise encore WS
      // → planifie la descente vers HTTP après hysteresis
      if (!this.hysteresisTimer) {
        this.hysteresisTimer = setTimeout(() => {
          this.hysteresisTimer = null
          this.wsTransport?.close()
          this.wsTransport = null
          this.activeTransport = this.httpTransport
        }, this.HYSTERESIS_MS)
      }
      // Pendant l'hysteresis on garde WS (pas de switch immédiat)
    }

    return this.activeTransport
  }

  // ─── Fermeture propre ─────────────────────────────────────────────────────────

  close(): void {
    if (this.hysteresisTimer) {
      clearTimeout(this.hysteresisTimer)
    }
    this.wsTransport?.close()
  }

  /**
   * Pour debug/observabilité : retourne le transport actif et le débit.
   */
  getStatus(): { transport: 'http' | 'ws', rate: number } {
    return {
      transport: this.activeTransport instanceof HttpTransport ? 'http' : 'ws',
      rate: this.currentRate(),
    }
  }
}
