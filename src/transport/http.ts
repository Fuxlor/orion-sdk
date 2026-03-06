import type { Transport, LogPayload, OrionConfig } from '../types.js'

/**
 * HttpTransport — envoie chaque log via un POST HTTP.
 *
 * AVANTAGES :
 * - Stateless : pas de connexion persistante à gérer
 * - Simple à déboguer (visible dans les DevTools/logs réseau)
 * - Fonctionne même derrière des proxies HTTP
 *
 * INCONVÉNIENTS :
 * - Overhead TCP+HTTP à chaque log (handshake, headers...)
 * - Mauvais sous fort volume (> ~10 logs/sec)
 * → Dans ce cas, le TransportManager bascule sur WebSocket
 */
export class HttpTransport implements Transport {
  private readonly url: string
  private readonly headers: Record<string, string>

  constructor(config: OrionConfig) {
    // L'URL de l'endpoint d'émission de logs
    this.url = `${config.apiUrl}/projects/${config.projectName}/sources/${config.sourceName}/logs/emit`

    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    }
  }

  async send(payload: LogPayload): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        level: payload.level,
        message: payload.message,
        timestamp: payload.timestamp,
        ...payload.meta,
      }),
      signal: AbortSignal.timeout(5000),   // timeout 5s
    })

    if (!response.ok) {
      throw new Error(`[Orion/HTTP] Échec de l'envoi : ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Rien à fermer pour HTTP (pas de connexion persistante).
   */
  close(): void {}
}
