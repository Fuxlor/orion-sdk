import { WebSocket } from 'ws'
import type { Transport, LogPayload, OrionConfig } from '../types.js'

/**
 * États internes de la connexion WebSocket.
 * On gère l'état manuellement pour éviter les race conditions.
 */
type WsState = 'connecting' | 'open' | 'closing' | 'closed'

/**
 * WebSocketTransport — connexion persistante pour fort volume de logs.
 *
 * AVANTAGES :
 * - Un seul handshake TCP pour N logs (idéal > 10 logs/sec)
 * - Latence réduite (pas de headers HTTP répétés)
 *
 * INCONVÉNIENTS :
 * - Connexion à maintenir (reconnexion si coupure)
 * - Légèrement plus complexe que HTTP
 *
 * RECONNEXION :
 * On implémente un "exponential backoff" : si la connexion tombe,
 * on attend 1s, puis 2s, puis 4s... jusqu'à MAX_RETRY_DELAY.
 * Les logs envoyés pendant la reconnexion sont mis en queue locale (MAX_QUEUE).
 */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null
  private state: WsState = 'closed'
  private retryDelay = 1000           // délai de reconnexion initial (ms)
  private retryTimer: NodeJS.Timeout | null = null
  private readonly MAX_RETRY_DELAY = 30_000   // 30s max entre tentatives
  private readonly MAX_QUEUE = 500            // max logs en attente hors connexion

  /**
   * Queue de logs accumulés pendant une déconnexion.
   * Flushés dès que la connexion est rétablie.
   */
  private pendingQueue: LogPayload[] = []

  private readonly wsUrl: string
  private readonly token: string

  constructor(config: OrionConfig) {
    // Convertit l'URL HTTP en WS (http→ws, https→wss)
    const base = config.apiUrl!.replace(/^http/, 'ws')
    this.wsUrl = `${base}/projects/${config.projectName}/sources/${config.sourceName}/ws`
    this.token = config.token
    this.connect()
  }

  // ─── Connexion & reconnexion ─────────────────────────────────────────────────

  private connect(): void {
    if (this.state === 'connecting' || this.state === 'open') return

    this.state = 'connecting'
    this.ws = new WebSocket(this.wsUrl, {
      headers: { Authorization: `Bearer ${this.token}` },
    })

    this.ws.on('open', () => {
      this.state = 'open'
      this.retryDelay = 1000     // reset du backoff après connexion réussie
      this.flushQueue()          // envoie les logs mis en attente
    })

    this.ws.on('close', () => {
      if (this.state === 'closing') {
        this.state = 'closed'
        return
      }
      // Déconnexion inattendue → on replanifie une reconnexion
      this.state = 'closed'
      this.scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      // On logge discrètement pour ne pas polluer les logs de l'utilisateur
      process.stderr.write(`[Orion/WS] Erreur : ${err.message}\n`)
    })
  }

  /**
   * Exponential backoff : chaque échec double le délai d'attente
   * jusqu'au plafond MAX_RETRY_DELAY.
   */
  private scheduleReconnect(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, this.retryDelay)

    this.retryDelay = Math.min(this.retryDelay * 2, this.MAX_RETRY_DELAY)
  }

  // ─── Envoi ────────────────────────────────────────────────────────────────────

  async send(payload: LogPayload): Promise<void> {
    if (this.state === 'open' && this.ws) {
      this.ws.send(JSON.stringify(payload))
    } else {
      // Connexion pas encore prête → on met en queue
      if (this.pendingQueue.length >= this.MAX_QUEUE) {
        // Si la queue est pleine, on jette le log le plus vieux (FIFO)
        this.pendingQueue.shift()
      }
      this.pendingQueue.push(payload)
    }
  }

  /**
   * Vide la queue de logs accumulés et les envoie dans l'ordre.
   */
  private flushQueue(): void {
    if (!this.ws || this.pendingQueue.length === 0) return
    for (const payload of this.pendingQueue) {
      this.ws.send(JSON.stringify(payload))
    }
    this.pendingQueue = []
  }

  // ─── Fermeture propre ─────────────────────────────────────────────────────────

  close(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.state = 'closing'
    this.ws?.close()
  }
}
