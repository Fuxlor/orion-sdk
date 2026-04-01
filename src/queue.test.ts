import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OfflineQueue } from './queue.js'
import type { LogPayload } from './types.js'

function makePayload(msg: string): LogPayload {
  return { level: 'info', message: msg, timestamp: new Date().toISOString() }
}

const BASE_CONFIG = { token: 'x', maxQueueSize: 3, retryInterval: 1000 }

// ─── Enqueue / dequeue (FIFO) ─────────────────────────────────────────────────

describe('OfflineQueue - enqueue', () => {
  it('stores items and exposes them via size', () => {
    const q = new OfflineQueue(BASE_CONFIG, vi.fn())
    q.enqueue(makePayload('a'))
    q.enqueue(makePayload('b'))
    expect(q.size).toBe(2)
    q.close()
  })

  it('drops the oldest entry when capacity is exceeded', () => {
    const q = new OfflineQueue(BASE_CONFIG, vi.fn())
    q.enqueue(makePayload('a'))
    q.enqueue(makePayload('b'))
    q.enqueue(makePayload('c'))
    // Queue is full (size 3); adding one more drops 'a'
    q.enqueue(makePayload('d'))
    expect(q.size).toBe(3)
    q.close()
  })

  it('flushes in FIFO order', async () => {
    const sent: string[] = []
    const sendFn = vi.fn(async (p: LogPayload) => {
      sent.push(p.message)
    })
    const q = new OfflineQueue(BASE_CONFIG, sendFn)
    q.enqueue(makePayload('first'))
    q.enqueue(makePayload('second'))
    q.enqueue(makePayload('third'))

    await q.flush()

    expect(sent).toEqual(['first', 'second', 'third'])
    expect(q.size).toBe(0)
    q.close()
  })
})

// ─── Max capacity ─────────────────────────────────────────────────────────────

describe('OfflineQueue - max capacity', () => {
  it('respects maxQueueSize = 1', () => {
    const q = new OfflineQueue({ token: 'x', maxQueueSize: 1, retryInterval: 1000 }, vi.fn())
    q.enqueue(makePayload('first'))
    q.enqueue(makePayload('second')) // 'first' is dropped
    expect(q.size).toBe(1)
    q.close()
  })

  it('oldest entry is dropped, newest kept', async () => {
    const sent: string[] = []
    const q = new OfflineQueue({ token: 'x', maxQueueSize: 2, retryInterval: 1000 }, async (p) => {
      sent.push(p.message)
    })
    q.enqueue(makePayload('old-1'))
    q.enqueue(makePayload('old-2'))
    q.enqueue(makePayload('new'))   // 'old-1' is dropped

    await q.flush()
    expect(sent).toEqual(['old-2', 'new'])
    q.close()
  })
})

// ─── Retry timer ─────────────────────────────────────────────────────────────

describe('OfflineQueue - retry timer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls sendFn after retryInterval elapses', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const q = new OfflineQueue({ token: 'x', maxQueueSize: 10, retryInterval: 1000 }, sendFn)

    q.enqueue(makePayload('pending'))

    // Advance time past the retry interval and flush pending promises
    await vi.advanceTimersByTimeAsync(1000)

    expect(sendFn).toHaveBeenCalledOnce()
    q.close()
  })

  it('stops the timer after queue is emptied on flush', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const q = new OfflineQueue({ token: 'x', maxQueueSize: 10, retryInterval: 500 }, sendFn)

    q.enqueue(makePayload('item'))
    await vi.advanceTimersByTimeAsync(500) // triggers flush, empties queue, stops timer

    sendFn.mockClear()
    await vi.advanceTimersByTimeAsync(1000) // no more ticks expected
    expect(sendFn).not.toHaveBeenCalled()
    q.close()
  })

  it('keeps the queue and retries next cycle when sendFn fails', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('down'))
    const q = new OfflineQueue({ token: 'x', maxQueueSize: 10, retryInterval: 500 }, sendFn)

    q.enqueue(makePayload('stuck'))
    await vi.advanceTimersByTimeAsync(500) // first retry fails
    expect(q.size).toBe(1) // still in queue

    await vi.advanceTimersByTimeAsync(500) // second retry also fails
    expect(sendFn).toHaveBeenCalledTimes(2)
    q.close()
  })
})

// ─── close() / clear ─────────────────────────────────────────────────────────

describe('OfflineQueue - close()', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stops the retry timer so no further sends occur', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const q = new OfflineQueue({ token: 'x', maxQueueSize: 10, retryInterval: 500 }, sendFn)

    q.enqueue(makePayload('item'))
    q.close()

    await vi.advanceTimersByTimeAsync(2000)
    expect(sendFn).not.toHaveBeenCalled()
  })

  it('can be called multiple times without error', () => {
    const q = new OfflineQueue(BASE_CONFIG, vi.fn())
    q.enqueue(makePayload('x'))
    expect(() => {
      q.close()
      q.close()
    }).not.toThrow()
  })
})

// ─── flush() ─────────────────────────────────────────────────────────────────

describe('OfflineQueue - flush()', () => {
  it('is a no-op when the queue is empty', async () => {
    const sendFn = vi.fn()
    const q = new OfflineQueue(BASE_CONFIG, sendFn)
    await q.flush()
    expect(sendFn).not.toHaveBeenCalled()
    q.close()
  })

  it('removes items from queue after successful send', async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined)
    const q = new OfflineQueue(BASE_CONFIG, sendFn)
    q.enqueue(makePayload('a'))
    q.enqueue(makePayload('b'))
    await q.flush()
    expect(q.size).toBe(0)
    q.close()
  })

  it('stops at first failure and leaves rest in queue', async () => {
    let calls = 0
    const sendFn = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('fail on first')
    })
    const q = new OfflineQueue(BASE_CONFIG, sendFn)
    q.enqueue(makePayload('a'))
    q.enqueue(makePayload('b'))
    await q.flush()

    expect(sendFn).toHaveBeenCalledOnce()
    expect(q.size).toBe(2) // both still in queue
    q.close()
  })
})
