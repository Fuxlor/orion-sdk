import type { LogPayload, OrionConfig } from './types.js'

/**
 * OfflineQueue — file d'attente en mémoire pour mode offline.
 *
 * Quand l'API Orion est indisponible, les logs sont stockés en mémoire
 * et réenvoyés automatiquement à intervalle régulier.
 *
 * COMPORTEMENT :
 *   - Queue FIFO avec limite configurable (défaut: 1000)
 *   - Retry automatique toutes les 30 secondes (configurable)
 *   - Si la queue est pleine, le log le plus ancien est supprimé
 *   - Peut être désactivée via `offline: false` dans la config
 */
export class OfflineQueue {
  private queue: LogPayload[] = []
  private readonly maxSize: number
  private readonly retryInterval: number
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private readonly sendFn: (payload: LogPayload) => Promise<void>
  private flushing = false

  constructor(config: OrionConfig, sendFn: (payload: LogPayload) => Promise<void>) {
    this.maxSize = config.maxQueueSize ?? 1000
    this.retryInterval = config.retryInterval ?? 30_000
    this.sendFn = sendFn
  }

  /** Nombre d'entrées en attente */
  get size(): number {
    return this.queue.length
  }

  /**
   * Ajoute un log à la queue. Si la queue est pleine, on supprime le plus ancien (FIFO).
   */
  enqueue(payload: LogPayload): void {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift()
    }
    this.queue.push(payload)
    this.startRetryLoop()
  }

  /**
   * Démarre la boucle de retry si elle n'est pas déjà active.
   */
  private startRetryLoop(): void {
    if (this.retryTimer) return

    this.retryTimer = setInterval(() => {
      void this.flush()
    }, this.retryInterval)

    // Permet à Node.js de s'arrêter même si le timer est actif
    if (this.retryTimer && typeof this.retryTimer === 'object' && 'unref' in this.retryTimer) {
      this.retryTimer.unref()
    }
  }

  /**
   * Tente de renvoyer tous les logs en attente.
   * S'arrête au premier échec (l'API est probablement encore down).
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true

    try {
      while (this.queue.length > 0) {
        const payload = this.queue[0]!
        await this.sendFn(payload)
        this.queue.shift() // supprime uniquement après envoi réussi
      }

      // Queue vidée → arrête le timer de retry
      this.stopRetryLoop()
    } catch {
      // L'API est encore down — on garde la queue et on retente au prochain cycle
    } finally {
      this.flushing = false
    }
  }

  /**
   * Arrête la boucle de retry.
   */
  private stopRetryLoop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Ferme la queue et arrête les timers.
   */
  close(): void {
    this.stopRetryLoop()
  }
}
