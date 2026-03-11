import os from 'os'
import type { OrionConfig } from './types.js'

let instance: HeartbeatThread | null = null

export function getHeartbeatThread(config: OrionConfig): HeartbeatThread {
    if (!instance) {
        instance = new HeartbeatThread(config)
    }
    return instance
}

function getLocalIp(): string | undefined {
    const ifaces = os.networkInterfaces()
    for (const iface of Object.values(ifaces)) {
        for (const entry of iface ?? []) {
            if (!entry.internal && entry.family === 'IPv4') return entry.address
        }
    }
    return undefined
}

export class HeartbeatThread {
    private readonly url: string
    private readonly commandsUrl: string
    private readonly headers: Record<string, string>
    private readonly timer: ReturnType<typeof setInterval>
    private readonly hostname: string
    private readonly ip: string | undefined
    private readonly config: OrionConfig

    constructor(config: OrionConfig) {
        this.config = config
        const apiUrl = config.apiUrl ?? 'http://localhost:3001/api'
        this.url = `${apiUrl}/projects/${config.projectName}/sources/${config.sourceName}/heartbeat`
        this.hostname = os.hostname()
        this.ip = getLocalIp()
        this.commandsUrl = `${apiUrl}/projects/${encodeURIComponent(config.projectName)}/servers/${encodeURIComponent(this.hostname)}/commands`
        this.headers = {
            'Authorization': `Bearer ${config.token}`,
            'Content-Type': 'application/json',
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
            body: JSON.stringify({ hostname: this.hostname, ip: this.ip }),
            signal: AbortSignal.timeout(5000),
        })

        if (response.status !== 204) {
            throw new Error(`[Orion] Heartbeat failed: ${response.status} ${response.statusText}`)
        }

        if (this.config.commandPolling !== false) {
            await this.pollCommands().catch(() => { })
        }
    }

    private async pollCommands(): Promise<void> {
        const response = await fetch(this.commandsUrl, {
            headers: this.headers,
            signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) return

        const data = await response.json() as {
            commands: Array<{ id: number; type: 'restart' | 'stop'; source_name: string | null }>
        }
        for (const cmd of data.commands ?? []) {
            if (cmd.source_name === this.config.sourceName) {
                this.executeCommand(cmd.id, cmd.type)
            }
        }
    }

    private async executeCommand(id: number, _type: 'restart' | 'stop'): Promise<void> {
        try {
            await this.ackCommand(id)
            if (_type === 'stop') {
                process.exit(0)
            }
        } catch {
            // ack failed — server will expire the command
        }
    }

    private async ackCommand(id: number): Promise<void> {
        await fetch(`${this.commandsUrl}/${id}/ack`, {
            method: 'POST',
            headers: this.headers,
        })
    }

    close(): void {
        clearInterval(this.timer)
        instance = null
    }
}
