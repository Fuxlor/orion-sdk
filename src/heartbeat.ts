import type { OrionConfig } from './types.js'

let instance: HeartbeatThread | null = null

export function getHeartbeatThread(config: OrionConfig): HeartbeatThread {
    if (!instance) {
        instance = new HeartbeatThread(config)
    }
    return instance
}

export class HeartbeatThread {
    private readonly url: string
    private readonly headers: Record<string, string>
    private readonly timer: ReturnType<typeof setInterval>

    constructor(config: OrionConfig) {
        const apiUrl = config.apiUrl ?? 'http://localhost:3001/api'
        this.url = `${apiUrl}/projects/${config.projectName}/sources/${config.sourceName}/heartbeat`
        this.headers = {
            'Authorization': `Bearer ${config.token}`,
        }

        const interval = config.heartbeatInterval ?? 30_000

        this.timer = setInterval(() => {
            this.ping().catch(() => {
                // Silently ignore — heartbeat failures should not crash the app
            })
        }, interval)

        this.timer.unref()

        this.ping()
    }

    private async ping(): Promise<void> {
        const response = await fetch(this.url, {
            method: 'POST',
            headers: this.headers,
            signal: AbortSignal.timeout(5000),
        })

        if (response.status !== 204) {
            throw new Error(`[Orion] Heartbeat failed: ${response.status} ${response.statusText}`)
        }
    }

    close(): void {
        clearInterval(this.timer)
        instance = null
    }
}
