# Cloud Deployment Plan

## Overview

Deploy the Check Card Game to the cloud using free-tier services. Priority: minimize cost (ideally $0/month for low traffic).

- **Database:** Azure Cosmos DB for MongoDB (free tier)
- **Server:** Azure App Service Free Tier (or Render free if Azure proves problematic for WebSockets)
- **Client:** Azure Static Web Apps Free Tier (or Vercel free)

---

## 1. Database — Azure Cosmos DB (MongoDB API)

### Why Cosmos DB

- User requested Azure Cosmos DB specifically
- Free tier: 1000 RU/s + 25 GB storage (perpetual, one per subscription)
- MongoDB API compatibility — minimal code changes (use existing Mongoose models)

### Connection Changes

- Replace `MONGODB_URI` from `mongodb://localhost:27017/check-card-game` to Cosmos DB connection string
- Cosmos DB connection string format: `mongodb://<account>:<key>@<account>.mongo.cosmos.azure.com:10255/<db>?ssl=true&replicaSet=globaldb&...`
- Add `retryWrites=false` to connection string (Cosmos DB doesn't support retryWrites)

### Code Changes — `server/src/utils/database.ts`

- Add connection options for Cosmos DB compatibility:
  ```typescript
  await mongoose.connect(uri, {
    retryWrites: false, // Cosmos DB requirement
    maxPoolSize: 10, // Connection pooling
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  ```
- Add graceful shutdown handler (`process.on('SIGTERM', ...)`)
- Add retry logic for initial connection (3 attempts with backoff)

### Cosmos DB Limitations to Handle

- **No `$unwind` + `$group` in all tiers** — Verify aggregation pipeline support for leaderboard queries. Cosmos DB supports most aggregation operators on the MongoDB API but some have limitations. Test the leaderboard aggregation pipeline early.
- **No retryable writes** — Already handled by `retryWrites: false`
- **Request Units (RUs)** — 1000 RU/s free tier is sufficient for a casual game with <50 concurrent users. Monitor RU consumption.
- **Indexing** — Cosmos DB indexes all fields by default. Override with custom indexing policy if needed for cost optimization.

### Setup Steps

1. Create Azure account (if not exists)
2. Create Cosmos DB account → API: "Azure Cosmos DB for MongoDB"
3. Enable free tier during creation
4. Create database: `check-card-game`
5. Get connection string from Azure Portal → Settings → Connection String
6. Set `MONGODB_URI` env var in server deployment

### Feature IDs

- **F-250**: Cosmos DB compatible database connection (retry logic, connection options, graceful shutdown)
- **F-251**: Verify and adapt aggregation pipelines for Cosmos DB compatibility

---

## 2. Server Deployment — Azure App Service (Free Tier)

### Why Azure App Service

- Free F1 tier: 60 min/day CPU, 1 GB RAM, 1 GB storage
- Supports Node.js natively
- WebSocket support (must be enabled in Configuration → General Settings)
- Keeps everything in Azure ecosystem with Cosmos DB

### Limitations of Free Tier

- **60 CPU minutes/day** — App stops after 60 min of CPU time (not wall clock). For a WebSocket app with idle connections, this may be tight. Monitor usage.
- **No custom domain on free tier** — Use `<appname>.azurewebsites.net`
- **No always-on** — App may cold start after inactivity (~20-30 seconds)
- **No deployment slots** — Single slot only

### Fallback: Render Free Tier

If Azure App Service free tier's 60 CPU min/day proves insufficient for WebSocket connections:

- **Render**: Free Web Service tier, 750 hours/month, auto-sleep after 15 min inactivity, WebSocket support
- **Railway**: $5 free credit/month, no sleep, WebSocket support

### Code Changes

#### Build Script

Add to `server/package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  }
}
```

#### TypeScript Compilation

- Server `tsconfig.json` already targets ES2020 + CommonJS — output to `dist/`
- Ensure `outDir: "./dist"` is set and `dist/` is in `.gitignore`

#### Environment Variables (Production)

```
PORT=8080                    # Azure default
MONGODB_URI=<cosmos-db-connection-string>
CLIENT_URL=https://<client-domain>
NODE_ENV=production
```

#### CORS Hardening

In `server/src/server.ts`:

- Currently CORS is `true` (allow all) in dev mode
- Production: Set `CLIENT_URL` env var and use it as the only allowed origin
- Socket.IO CORS must match

#### Path Alias Resolution

- Server uses `@/*` path alias → needs `tsconfig-paths` or path rewriting in build
- Option A: Add `tsc-alias` as post-build step: `tsc && tsc-alias`
- Option B: Replace `@/` imports with relative imports (cleaner for production)

### Setup Steps

1. Create App Service → Runtime: Node.js 20 LTS, OS: Linux, Plan: Free F1
2. Enable WebSockets in Configuration → General Settings
3. Set environment variables in Configuration → Application Settings
4. Deploy via GitHub Actions or Azure CLI (`az webapp deploy`)

### Feature IDs

- **F-252**: Server production build configuration (tsc, start script, path alias resolution)
- **F-253**: CORS hardening for production (environment-based origin)
- **F-254**: Azure App Service deployment configuration

---

## 3. Client Deployment — Azure Static Web Apps (Free Tier)

### Why Azure Static Web Apps

- Free tier: 100 GB bandwidth/month, 2 custom domains, global CDN
- Built-in CI/CD with GitHub Actions
- Perfect for Vite/React SPA

### Fallback: Vercel

- If Azure Static Web Apps doesn't fit, Vercel free tier is an excellent alternative
- 100 GB bandwidth, automatic HTTPS, preview deployments

### Code Changes

#### Environment Variable

- Client needs to know the server URL at build time
- Add `VITE_SERVER_URL` env var
- Update `client/src/services/socket.ts` to use:
  ```typescript
  const SERVER_URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;
  ```

#### Build Output

- `vite build` → outputs to `client/dist/`
- SPA fallback: Configure `staticwebapp.config.json` for client-side routing:
  ```json
  {
    "navigationFallback": {
      "rewrite": "/index.html"
    }
  }
  ```

### Setup Steps

1. Create Static Web App in Azure Portal
2. Connect to GitHub repository
3. Set build config: App location: `client`, Output: `dist`, API: (none)
4. Set environment variable: `VITE_SERVER_URL=https://<server-domain>`

### Feature IDs

- **F-255**: Client production build with configurable server URL
- **F-256**: Static Web App configuration (SPA fallback, routing)
- **F-257**: Azure Static Web Apps deployment

---

## 4. CI/CD Pipeline

### GitHub Actions Workflow

File: `.github/workflows/deploy.yml`

#### Triggers

- Push to `main` branch
- Manual dispatch

#### Jobs

**1. `test` job:**

- Checkout code
- Install dependencies (`npm ci`)
- Type check both packages (`npx tsc --noEmit`)
- Lint (`npm run lint --workspaces --if-present`)
- Run server tests (`npm run test --workspace=server`)

**2. `deploy-server` job (depends on `test`):**

- Build server (`npm run build --workspace=server`)
- Deploy to Azure App Service (or Render)

**3. `deploy-client` job (depends on `test`):**

- Build client (`npm run build --workspace=client`)
- Deploy to Azure Static Web Apps (or Vercel)

### Feature IDs

- **F-258**: GitHub Actions CI pipeline (test + lint + type check)
- **F-259**: GitHub Actions CD pipeline (server deploy)
- **F-260**: GitHub Actions CD pipeline (client deploy)

---

## 5. Production Hardening

### Server Changes

- **Rate limiting**: Add `express-rate-limit` for REST endpoints (leaderboard API)
- **Helmet**: Add `helmet` middleware for security headers
- **Compression**: Add `compression` middleware for response compression
- **Health check**: Existing `/api/health` endpoint — enhance to check Cosmos DB connection
- **Logging**: Add structured logging (replace `console.log` with a logger like `pino`)
- **Error handling**: Global error handler middleware

### Socket.IO Production Config

```typescript
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  // For single instance (free tier), no Redis adapter needed
});
```

### Feature IDs

- **F-261**: Rate limiting on REST endpoints
- **F-262**: Security headers (helmet) and compression
- **F-263**: Structured logging (pino or similar)
- **F-264**: Global error handling middleware

---

## 6. Implementation Order

### Branch: `feature/cloud-deployment`

| Step | Features            | Description                                               |
| ---- | ------------------- | --------------------------------------------------------- |
| 1    | F-250               | Database connection hardening (Cosmos DB compatible)      |
| 2    | F-252               | Server production build config                            |
| 3    | F-253               | CORS hardening for production                             |
| 4    | F-255, F-256        | Client production build + SPA config                      |
| 5    | F-261, F-262, F-264 | Production hardening (rate limit, helmet, error handling) |
| 6    | F-258               | CI pipeline (GitHub Actions test job)                     |
| 7    | F-251               | Verify aggregation pipelines on Cosmos DB                 |
| 8    | F-254, F-257        | Azure deployment configs                                  |
| 9    | F-259, F-260        | CD pipeline jobs                                          |
| 10   | F-263               | Structured logging (lower priority)                       |

### Dependencies

- Game History + Leaderboard plan should be implemented FIRST (F-230 to F-240), since the deployment plan includes verifying aggregation pipelines (F-251) and rate limiting the leaderboard API (F-261).
- Cosmos DB account must be created manually in Azure Portal before deployment.

---

## 7. Environment Variables (Production)

| Variable          | Value                                          | Where                  |
| ----------------- | ---------------------------------------------- | ---------------------- |
| `PORT`            | `8080`                                         | Server (Azure default) |
| `MONGODB_URI`     | Cosmos DB connection string                    | Server                 |
| `CLIENT_URL`      | `https://<static-web-app>.azurestaticapps.net` | Server                 |
| `NODE_ENV`        | `production`                                   | Server                 |
| `VITE_SERVER_URL` | `https://<app-service>.azurewebsites.net`      | Client (build-time)    |

---

## 8. Cost Estimate

| Service               | Tier                     | Monthly Cost |
| --------------------- | ------------------------ | ------------ |
| Azure Cosmos DB       | Free (1000 RU/s, 25 GB)  | $0           |
| Azure App Service     | Free F1 (60 CPU min/day) | $0           |
| Azure Static Web Apps | Free (100 GB bandwidth)  | $0           |
| **Total**             |                          | **$0/month** |

### When Free Tier Isn't Enough

- If App Service 60 CPU min/day is exceeded → Upgrade to B1 ($13/month) or switch to Render free tier
- If Cosmos DB 1000 RU/s is exceeded → Consider MongoDB Atlas free tier (512 MB) as alternative
- If traffic grows significantly → Consider upgrading to paid tiers or adding Redis for Socket.IO adapter

---

## 9. FEATURES.md Entries to Add

```markdown
### Cloud Deployment

- [ ] **F-250**: Cosmos DB compatible database connection
- [ ] **F-251**: Verify aggregation pipelines for Cosmos DB
- [ ] **F-252**: Server production build configuration
- [ ] **F-253**: CORS hardening for production
- [ ] **F-254**: Azure App Service deployment configuration
- [ ] **F-255**: Client production build with configurable server URL
- [ ] **F-256**: Static Web App configuration (SPA fallback)
- [ ] **F-257**: Azure Static Web Apps deployment
- [ ] **F-258**: GitHub Actions CI pipeline
- [ ] **F-259**: GitHub Actions CD — server deploy
- [ ] **F-260**: GitHub Actions CD — client deploy
- [ ] **F-261**: Rate limiting on REST endpoints
- [ ] **F-262**: Security headers and compression
- [ ] **F-263**: Structured logging
- [ ] **F-264**: Global error handling middleware
```
