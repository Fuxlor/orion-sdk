import type { LogPayload, OrionConfig } from './types.js'

/**
 * OfflineQueue — in-memory queue for offline mode.
 *
 * When the Orion API is unavailable, logs are stored in memory
 * and automatically retried at a regular interval.
 *
 * BEHAVIOR:
 *   - FIFO queue with a configurable limit (default: 1000)
 *   - Automatic retry every 30 seconds (configurable)
 *   - If the queue is full, the oldest log is dropped
 *   - Can be disabled via `offline: false` in the config
 */
export class OfflineQueue {
  private queue: LogPayload[] = []
  private readonly maxSize: number
  private readonly retryInterval: number
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private readonly sendFn: (payload: LogPayload) => Promise<void>
  private readonly onDrop: ((dropped: LogPayload) => void) | undefined
  private flushing = false

  constructor(config: OrionConfig, sendFn: (payload: LogPayload) => Promise<void>) {
    this.maxSize = config.maxQueueSize ?? 1000
    this.retryInterval = config.retryInterval ?? 30_000
    this.sendFn = sendFn
    this.onDrop = config.onDrop
  }

  /** Number of pending entries */
  get size(): number {
    return this.queue.length
  }

  /**
   * Adds a log to the queue. If the queue is full, the oldest entry is dropped (FIFO).
   */
  enqueue(payload: LogPayload): void {
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift()!
      this.onDrop?.(dropped)
    }
    this.queue.push(payload)
    this.startRetryLoop()
  }

  /**
   * Starts the retry loop if it is not already running.
   */
  private startRetryLoop(): void {
    if (this.retryTimer) return

    this.retryTimer = setInterval(() => {
      void this.flush()
    }, this.retryInterval)

    // Allows Node.js to exit even if the timer is active
    if (this.retryTimer && typeof this.retryTimer === 'object' && 'unref' in this.retryTimer) {
      this.retryTimer.unref()
    }
  }

  /**
   * Attempts to resend all queued logs.
   * Stops on the first failure (API is likely still down).
   */
  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true

    try {
      while (this.queue.length > 0) {
        const payload = this.queue[0]!
        await this.sendFn(payload)
        this.queue.shift() // remove only after successful send
      }

      // Queue emptied → stop the retry timer
      this.stopRetryLoop()
    } catch {
      // API is still down — keep the queue and retry next cycle
    } finally {
      this.flushing = false
    }
  }

  /**
   * Stops the retry loop.
   */
  private stopRetryLoop(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Closes the queue and stops all timers.
   */
  close(): void {
    this.stopRetryLoop()
  }
}
