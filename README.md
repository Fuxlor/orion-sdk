# orion-monitoring

TypeScript client SDK for the Orion monitoring platform. Sends structured logs from your Node.js application to the Orion API with built-in offline resilience.

## Features

- 6 log severity levels
- Offline queue with automatic retry
- Express and Fastify middleware adapters
- Zero core runtime dependencies (uses Node 18+ native `fetch`)
- ESM, TypeScript-first

## Installation

```bash
npm install orion-monitoring
```

**Requirements:** Node.js >= 18.0.0, ESM project (`"type": "module"` in `package.json`)

---

## Quick Start

Initialize with the CLI (recommended):

```bash
npx orion-setup
```

Or pass the token directly:

```typescript
import { createLogger } from 'orion-monitoring'

const logger = createLogger({ token: 'your-sdk-token' })
logger.info('Server started')
```

The SDK auto-discovers `.orion/config.json` by walking up the directory tree from the entry point — so if you used `orion-setup`, no token argument is needed:

```typescript
const logger = createLogger()
logger.info('Server started')
```

---

## Logging

### Level methods

```typescript
logger.info('Server started')
logger.warn('High memory usage', { heap: '450MB' })
logger.error('Database connection failed', { error: 'ECONNREFUSED', port: 5432 })
logger.debug('Cache updated')
logger.verbose('Request details', { path: '/api/v1/users' })
logger.trace('Entered function processPayment')
```

All methods accept an optional `meta` object and an optional `tags` array:

```typescript
logger.info('User signed in', { userId: '123' }, ['auth', 'login'])
```

### `send()` — flexible form

```typescript
// String only (uses default level if set)
logger.send('Cache warmed')

// Explicit level
logger.send('error', 'Payment failed')

// Structured object — attach any metadata
logger.send({
  level: 'error',
  message: 'Payment failed',
  userId: '123',
  amount: 49.99,
})
```

### Pre-configured default level

```typescript
import { Orion } from 'orion-monitoring'

const logger = Orion.createLogger('debug')
logger.send('Cache warmed')  // logged at 'debug' level
```

---

## Log Levels

```typescript
type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'trace'
```

---

## Offline Queue

When the Orion API is unreachable, logs are buffered in memory and retried automatically.

- **FIFO**: oldest entries are dropped when the queue is full
- **Auto-retry**: every 30s by default
- **Drop callback**: get notified when a log is dropped

```typescript
const logger = createLogger({
  token: 'your-sdk-token',
  offline: true,         // default
  maxQueueSize: 500,
  retryInterval: 10000,  // 10s
  onDrop: (log) => {
    console.warn('Log dropped (queue full):', log.message)
  },
})
```

---

## Express Middleware

```typescript
import express from 'express'
import { createOrionMiddleware } from 'orion-monitoring'

const app = express()

app.use(await createOrionMiddleware({
  exclude: ['/health', '/metrics'],
  logBody: false,
  logHeaders: false,
  level: {
    success: 'info',      // 2xx  (default)
    clientError: 'warn',  // 4xx  (default)
    serverError: 'error', // 5xx  (default)
  },
}))

// → Logs: "GET /api/v1/users 200 — 12ms"
```

---

## Fastify Plugin

```typescript
import Fastify from 'fastify'
import { orionPlugin } from 'orion-monitoring'

const fastify = Fastify()

await fastify.register(orionPlugin, {
  exclude: ['/health'],
})

// → Logs: "GET /api/v1/users 200 — 5ms"
```

Uncaught errors are logged automatically with message and stack trace.

---

## Shutdown

Call `logger.close()` to flush the offline queue and stop background timers before your process exits:

```typescript
process.on('SIGTERM', () => {
  logger.close()
  process.exit(0)
})
```

---

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `token` | `string` | — | **Required.** SDK token for your source |
| `offline` | `boolean` | `true` | Buffer and retry logs when the API is unreachable |
| `maxQueueSize` | `number` | `1000` | Max buffered logs (oldest dropped when full) |
| `retryInterval` | `number` | `30000` | Queue retry interval in ms |
| `onDrop` | `(log: LogPayload) => void` | — | Called when a log is dropped due to a full queue |

---

## Exports

```typescript
// Factory functions
export function createLogger(override?: Partial<OrionConfig>): Logger
export const Orion: { createLogger(levelOrConfig?: LogLevel | Partial<OrionConfig>): Logger }

// Classes
export { Logger }
export { OfflineQueue }

// Middleware adapters
export { createOrionMiddleware }  // Express
export { orionPlugin }             // Fastify

// Config
export { resolveConfig }

// Types
export type { LogLevel, LogPayload, OrionConfig, MiddlewareOptions }
```

---

## License

MIT
