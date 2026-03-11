# Orion SDK

TypeScript client SDK for the **Orion** monitoring platform.
Sends logs from your Node.js application to the Orion API.

## Installation

```bash
npm install @orion-monitoring/sdk
```

## Configuration

Create an `orion.config.ts` file at the root of your project (or use `npx @orion-monitoring/sdk`):

```typescript
import { defineConfig } from '@orion-monitoring/cli'

export default defineConfig({
  token: 'your-token',
  projectName: 'my-project',
  sourceName: 'api-backend',
})
```

### Configuration options

| Option                     | Type      | Default | Description                              |
| -------------------------- | --------- | ------- | ---------------------------------------- |
| `token`                    | `string`  | —       | Authentication token (required)          |
| `projectName`              | `string`  | —       | Project name (required)                  |
| `sourceName`               | `string`  | —       | Source name (required)                   |
| `offline`                  | `boolean` | `true`  | Enable the offline queue                 |
| `maxQueueSize`             | `number`  | `1000`  | Maximum queue size                       |
| `retryInterval`            | `number`  | `30000` | Retry interval in ms                     |
| `performance`              | `boolean` | `false` | Enable performance monitoring            |
| `performanceInterval`      | `number`  | `60000` | Performance collection interval          |
| `performanceCustomMessage` | `string`  | —       | Custom message for performance logs      |

---

## Usage

### Basic logger

```typescript
import { createLogger } from '@orion-monitoring/sdk'

const logger = createLogger()

logger.info('Server started')
logger.warn('Rate limit reached')
logger.error('DB connection failed')
logger.debug('Request received')
logger.verbose('Request details')
logger.trace('Entered function')
```

### Logger with explicit config

```typescript
import { createLogger } from '@orion-monitoring/sdk'

const logger = createLogger({
  token: 'my-token',
  projectName: 'my-project',
  sourceName: 'api-backend',
})
```

### Structured logs

```typescript
logger.send('error', 'Database crash')

logger.send({
  level: 'error',
  message: 'Payment failed',
  userId: '123',
  amount: 49.99,
})
```

### Pre-configured logger

```typescript
import { createLogger } from '@orion-monitoring/sdk'

logger = createLogger('debug')

logger.send('Debug log')
```

---

## Express Middleware

```typescript
import express from 'express'
import { createOrionMiddleware } from 'orion/middlewares/express'

const app = express()

app.use(await createOrionMiddleware({
  exclude: ['/health', '/metrics'],
  level: {
    success: 'info',
    clientError: 'warn',
    serverError: 'error',
  },
}))

app.get('/api/users', (req, res) => {
  res.json([{ name: 'Alice' }])
})
// → Automatically logs: "GET /api/users 200 — 12ms"

app.listen(3000)
```

---

## Fastify Plugin

```typescript
import Fastify from 'fastify'
import { orionPlugin } from 'orion/middlewares/fastify'

const fastify = Fastify()

await fastify.register(orionPlugin, {
  exclude: ['/health'],
})

fastify.get('/api/users', async () => {
  return [{ name: 'Alice' }]
})
// → Automatically logs: "GET /api/users 200 — 5ms"

await fastify.listen({ port: 3000 })
```

---

## Offline mode

By default, if the Orion API is unavailable, logs are stored in memory and automatically retried every 30 seconds.

- **FIFO Queue**: oldest logs are dropped if the queue reaches 1000 entries
- **Automatic retry**: every 30s (configurable via `retryInterval`)
- **Disableable**: `offline: false` in the config

```typescript
const logger = createLogger({
  token: '...',
  projectName: '...',
  sourceName: '...',
  offline: true,        // default
  maxQueueSize: 500,    // custom
  retryInterval: 10000, // 10 seconds
})
```

---

## Clean shutdown

```typescript
process.on('SIGTERM', () => {
  logger.close()
  process.exit(0)
})
```

---

## Constraints

- **Strict TypeScript**, ESM only
- **Node.js >= 18** (uses native `fetch`)
- **Zero runtime dependencies**
- `express` and `fastify` as optional `peerDependencies`
