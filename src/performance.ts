import type { OrionConfig } from './types.js'
import pidusage from 'pidusage'

export class PerformanceLoggingThread {
    private readonly config: OrionConfig
    private readonly url: string
    private readonly headers: Record<string, string>

    constructor(config: OrionConfig) {
        this.config = config
        if (this.config.performanceInterval == undefined) {
            throw Error('Invalid performance interval')
        }
        this.url = `http://localhost:3001/api/projects/${config.projectName}/sources/${config.sourceName}/logs/performance`
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.token}`,
        }

        setInterval(async () => {
            await this.logPerformance()
        }, this.config.performanceInterval)
    }

    private async logPerformance(): Promise<void> {
        /**
         * Envoie un payload à l'API Orion via fetch.
         * @throws Si la réponse n'est pas ok (pour que la queue puisse réessayer)
         */
        const stats = await pidusage(process.pid)
        const response = await fetch(this.url, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                message: this.config.performanceCustomMessage ?? "[orion:perf] System metrics",
                cpu: stats.cpu,
                memory_used_mb: stats.memory,
                memory_total_mb: process.availableMemory(),
                uptime: stats.elapsed,
            }),
            signal: AbortSignal.timeout(5000),
        })
    
        if (!response.ok) {
            throw new Error(`[Orion] Échec de l'envoi : ${response.status} ${response.statusText}`)
        }
    }
}