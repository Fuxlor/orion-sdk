# orion-monitoring

TypeScript client SDK for the [Orion](https://orion.dev) monitoring platform. Sends structured logs from your Node.js application to the Orion API.

## Features

- 6 log severity levels
- Offline queue with automatic retry
- Optional CPU/memory performance monitoring
- Optional heartbeat with remote command polling
- Express and Fastify middleware adapters
- Zero core runtime dependencies (uses Node 18+ native `fetch`)

## Installation

```bash
npm install orion-monitoring
```

## Quick start

```typescript
import { createLogger } from 'orion-monitoring'
const logger = createLogger({ token: 'your-sdk-token' })
logger.info('Server started')
```

## Setup

Generate `orion.config.ts` with the CLI:

```bash
npx @orion-monitoring/cli
```

Or create it manually:

```typescript
import { resolveConfig } from 'orion-monitoring'

export default resolveConfig({
  token: 'your-sdk-token',
})
```

## Usage

### Basic logging

```typescript
import { createLogger } from 'orion-monitoring'

const logger = createLogger()

logger.info('Server started')
logger.warn('High memory usage', { heap: '450MB' })
logger.error('Database connection failed', { error: 'ECONNREFUSED', port: 5432 })
logger.debug('Cache updated')
logger.verbose('Request details', { path: '/api/v1/users' })
logger.trace('Entered function processPayment')
```

### With explicit config

```typescript
const logger = createLogger({
  token: 'my-token',
  performance: true,
})
```

### Structured logs

```typescript
// Explicit level as first argument
logger.send('error', 'Payment failed')

// Object form — attach any metadata
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

### Clean shutdown

```typescript
process.on('SIGTERM', () => {
  logger.close()  // flushes queue and stops background intervals
  process.exit(0)
})
```

## Express Middleware

```typescript
import express from 'express'
import { createOrionMiddleware } from 'orion-monitoring'

const app = express()

app.use(await createOrionMiddleware({
  exclude: ['/health', '/metrics'],
  level: {
    success: 'info',      // 2xx
    clientError: 'warn',  // 4xx
    serverError: 'error', // 5xx
  },
  logBody: false,
  logHeaders: false,
}))

app.get('/api/v1/users', (req, res) => {
  res.json([{ name: 'Alice' }])
})
// → Logs: "GET /api/v1/users 200 — 12ms"
```

## Fastify Plugin

```typescript
import Fastify from 'fastify'
import { orionPlugin } from 'orion-monitoring'

const fastify = Fastify()

await fastify.register(orionPlugin, {
  exclude: ['/health'],
})

fastify.get('/api/v1/users', async () => {
  return [{ name: 'Alice' }]
})
// → Logs: "GET /api/v1/users 200 — 5ms"

await fastify.listen({ port: 3000 })
```

## Offline Mode

When the Orion API is unreachable, logs are buffered in memory and retried automatically.

- **FIFO queue**: oldest entries are dropped when the queue is full
- **Automatic retry**: every 30s by default
- **Configurable**: adjust size and interval, or disable entirely
- **Drop callback**: get notified when a log is dropped due to a full queue

```typescript
const logger = createLogger({
  token: '...',
  offline: true,         // default
  maxQueueSize: 500,
  retryInterval: 10000,  // 10s
  onDrop: (log) => {
    console.warn('[Orion] Log dropped (queue full):', log.message)
  },
})
```

## Configuration

All options for `orion.config.ts` or the `createLogger()` override:

| Option | Type | Default | Description |
|---|---|---|---|
| `token` | `string` | — | **Required.** SDK token for your source |
| `offline` | `boolean` | `true` | Buffer and retry logs on API failure |
| `maxQueueSize` | `number` | `1000` | Max buffered logs (oldest dropped when full) |
| `retryInterval` | `number` | `30000` | Queue retry interval in ms |
| `onDrop` | `(log: LogPayload) => void` | — | Called when a log is dropped (queue full) |
| `performance` | `boolean` | `false` | Collect and send CPU/memory metrics |
| `performanceInterval` | `number` | `60000` | Metrics collection interval in ms (min 10000) |
| `performanceCustomMessage` | `string` | — | Custom label attached to performance logs |
| `heartbeat` | `boolean` | `true` | Send periodic pings to mark server online |
| `heartbeatInterval` | `number` | `30000` | Heartbeat interval in ms (min 30000) |
| `commandPolling` | `boolean` | `true` | Poll for remote commands (restart/stop) |

## Log Levels

```typescript
type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'trace'
```

## Requirements

- Node.js >= 18.0.0
- ESM project (`"type": "module"` in `package.json`)
- `express` or `fastify` as optional peer dependencies (only needed for their respective adapters)

## License

MIT
