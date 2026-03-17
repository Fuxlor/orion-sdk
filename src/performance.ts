import type { OrionConfig } from './types.js'
import pidusage from 'pidusage'

let instance: PerformanceLoggingThread | null = null

export function getPerformanceLoggingThread(config: OrionConfig): PerformanceLoggingThread {
    if (!instance) {
        instance = new PerformanceLoggingThread(config)
    }
    return instance
}

export class PerformanceLoggingThread {
    private readonly config: OrionConfig
    private readonly url: string
    private readonly headers: Record<string, string>
    private readonly timer: ReturnType<typeof setInterval>

    constructor(config: OrionConfig) {
        this.config = config
        if (config.performance === undefined) {
            throw Error('Invalid performance interval')
        }
        const apiUrl = config.apiUrl ?? 'http://localhost:3001/api'
        this.url = `${apiUrl}/logs/performance`
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.token}`,
        }

        this.timer = setInterval(async () => {
            await this.logPerformance()
        }, this.config.performanceInterval)

        this.timer.unref()
    }

    private async logPerformance(): Promise<void> {
        const stats = await pidusage(process.pid)
        const mem = process.memoryUsage()
        const response = await fetch(this.url, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({
                message: this.config.performanceCustomMessage ?? "[orion:perf] System metrics",
                cpu: stats.cpu,
                memory_used_bytes: mem.heapUsed,
                memory_total_bytes: mem.heapTotal,
                uptime_seconds: Math.floor(process.uptime()),
            }),
            signal: AbortSignal.timeout(5000),
        })

        if (!response.ok) {
            throw new Error(`[Orion] Send failed: ${response.status} ${response.statusText}`)
        }
    }

    close(): void {
        clearInterval(this.timer)
        instance = null
    }
}
