# Orion SDK

SDK client TypeScript pour la plateforme de monitoring **Orion**.  
Envoie des logs depuis votre application Node.js vers l'API Orion.

## Installation

```bash
npm install @orion-monitoring/sdk
```

## Configuration

Créez un fichier `orion.config.ts` à la racine de votre projet (ou utilisez `npx @orion-monitoring/cli`) :

```typescript
import { defineConfig } from '@orion-monitoring/cli'

export default defineConfig({
  token: 'votre-token',
  projectName: 'mon-projet',
  sourceName: 'api-backend',
})
```

### Options de configuration

| Option          | Type      | Défaut                         | Description                              |
| --------------- | --------- | ------------------------------ | ---------------------------------------- |
| `token`         | `string`  | —                              | Token d'authentification (obligatoire)   |
| `projectName`   | `string`  | —                              | Nom du projet (obligatoire)              |
| `sourceName`    | `string`  | —                              | Nom de la source (obligatoire)           |
| `offline`       | `boolean` | `true`                         | Active la queue offline                  |
| `maxQueueSize`  | `number`  | `1000`                         | Taille max de la queue                   |
| `retryInterval` | `number`  | `30000`                        | Intervalle de retry en ms                |

---

## Utilisation

### Logger basique

```typescript
import { createLogger } from '@orion-monitoring/sdk'

const logger = createLogger()

logger.info('Serveur démarré')
logger.warn('Rate limit atteint')
logger.error('Connexion BDD échouée')
logger.debug('Requête reçue')
logger.verbose('Détails de la requête')
logger.trace('Entrée dans la fonction')
```

### Logger avec config explicite

```typescript
import { createLogger } from '@orion-monitoring/sdk'

const logger = createLogger({
  token: 'mon-token',
  projectName: 'mon-projet',
  sourceName: 'api-backend',
})
```

### Logs structurés

```typescript
logger.send('error', 'Crash de la base de données')

logger.send({
  level: 'error',
  message: 'Paiement échoué',
  userId: '123',
  amount: 49.99,
})
```

### Logger préconfiguré

```typescript
import { createLogger } from '@orion-monitoring/sdk'

logger = createLogger('debug')

logger.send('Log de debug')
```

---

## Middleware Express

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
// → Log automatiquement : "GET /api/users 200 — 12ms"

app.listen(3000)
```

---

## Plugin Fastify

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
// → Log automatiquement : "GET /api/users 200 — 5ms"

await fastify.listen({ port: 3000 })
```

---

## Mode offline

Par défaut, si l'API Orion est indisponible, les logs sont stockés en mémoire et réenvoyés automatiquement toutes les 30 secondes.

- **Queue FIFO** : les logs les plus anciens sont supprimés si la queue atteint 1000 entrées
- **Retry automatique** : toutes les 30s (configurable via `retryInterval`)
- **Désactivable** : `offline: false` dans la config

```typescript
const logger = createLogger({
  token: '...',
  projectName: '...',
  sourceName: '...',
  offline: true,       // défaut
  maxQueueSize: 500,   // personnalisé
  retryInterval: 10000, // 10 secondes
})
```

---

## Fermeture propre

```typescript
process.on('SIGTERM', () => {
  logger.close()
  process.exit(0)
})
```

---

## Contraintes

- **TypeScript strict**, ESM uniquement
- **Node.js >= 18** (utilise `fetch` natif)
- **Zéro dépendance runtime**
- `express` et `fastify` en `peerDependencies` optionnelles
