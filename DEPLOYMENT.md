# Azure Deployment Guide

Step-by-step instructions for deploying Check Card Game to Azure free-tier services.

**Estimated cost: $0/month** (all free tiers)

---

## Prerequisites

- Azure account ([create free](https://azure.microsoft.com/free/))
- Azure CLI installed (`brew install azure-cli` on macOS)
- GitHub repository with this code pushed

---

## Step 1: Create Azure Cosmos DB (Database)

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** > search **Azure Cosmos DB**
3. Select **Azure Cosmos DB for MongoDB** (the MongoDB API option)
4. Fill in:
   - **Subscription**: your subscription
   - **Resource Group**: create new, e.g. `check-card-game-rg`
   - **Account Name**: e.g. `check-card-game-db` (must be globally unique)
   - **Location**: closest to your users
   - **Capacity mode**: Serverless (or Provisioned with free tier)
   - **Apply Free Tier Discount**: **Yes** (one per subscription, 1000 RU/s + 25 GB)
5. Click **Review + Create** > **Create**
6. Once created, go to **Settings > Connection String**
7. Copy the **Primary Connection String**
8. Append the database name to the connection string:
   ```
   mongodb://...?ssl=true&replicaSet=globaldb&retryWrites=false&maxIdleTimeMS=120000&appName=@check-card-game-db@
   ```
   Add `/check-card-game` before the `?`:
   ```
   mongodb://...:10255/check-card-game?ssl=true&...
   ```

> **Note**: The `retryWrites=false` is handled in code, but you can also add it to the connection string for safety.

---

## Step 2: Create Azure App Service (Server)

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** > **Web App**
3. Fill in:
   - **Subscription**: your subscription
   - **Resource Group**: `check-card-game-rg` (same as above)
   - **Name**: e.g. `check-card-game-server` (this becomes `check-card-game-server.azurewebsites.net`)
   - **Publish**: Code
   - **Runtime stack**: Node 20 LTS
   - **Operating System**: Linux
   - **Region**: same as Cosmos DB
   - **Pricing Plan**: **Free F1**
4. Click **Review + Create** > **Create**

### Configure the App Service

5. Go to your App Service > **Settings > Configuration > General settings**:
   - **Web sockets**: **On** (required for Socket.IO)
   - **Startup Command**: `npm run start --workspace=server`
6. Go to **Configuration > Application settings**, add:

   | Name          | Value                                               |
   | ------------- | --------------------------------------------------- |
   | `PORT`        | `8080`                                              |
   | `NODE_ENV`    | `production`                                        |
   | `MONGODB_URI` | _(Cosmos DB connection string from Step 1)_         |
   | `CLIENT_URL`  | `https://<your-static-web-app>.azurestaticapps.net` |

   (You'll fill in `CLIENT_URL` after creating the Static Web App in Step 3)

7. Click **Save**

### Get Publish Profile (for GitHub Actions)

8. Go to your App Service > **Overview** > click **Download publish profile**
9. Open the downloaded file in a text editor, copy the entire XML content
10. Go to your GitHub repo > **Settings > Secrets and variables > Actions**
11. Add these secrets:
    - `AZURE_SERVER_APP_NAME`: your app name (e.g. `check-card-game-server`)
    - `AZURE_SERVER_PUBLISH_PROFILE`: paste the entire XML content

---

## Step 3: Create Azure Static Web App (Client)

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** > search **Static Web App**
3. Fill in:
   - **Subscription**: your subscription
   - **Resource Group**: `check-card-game-rg`
   - **Name**: e.g. `check-card-game-client`
   - **Plan type**: **Free**
   - **Source**: **GitHub**
   - **Organization/Repository/Branch**: select your repo and `main` branch
   - **Build Preset**: Custom
   - **App location**: `client`
   - **Output location**: `dist`
   - Leave API location empty
4. Click **Review + Create** > **Create**

### Get the deployment token

5. Go to your Static Web App > **Overview** > click **Manage deployment token**
6. Copy the token
7. Go to your GitHub repo > **Settings > Secrets and variables > Actions**
8. Add these secrets:
   - `AZURE_STATIC_WEB_APPS_API_TOKEN`: paste the deployment token
   - `VITE_SOCKET_URL`: `https://check-card-game-server.azurewebsites.net`

### Update App Service CLIENT_URL

9. Go back to your App Service > **Configuration > Application settings**
10. Set `CLIENT_URL` to `https://<your-static-web-app>.azurestaticapps.net`
    (find this URL on the Static Web App overview page)
11. Click **Save**

---

## Step 4: Deploy

### Option A: Automatic (GitHub Actions)

After setting up all GitHub Secrets, any push to `main` will trigger the deploy workflow:

1. Push your code to `main`
2. Go to GitHub > **Actions** tab to monitor the deploy
3. The workflow runs tests first, then deploys server and client in parallel

### Option B: Manual Deploy

**Deploy Server manually:**

```bash
# Login to Azure
az login

# Build the server
npm run build --workspace=server

# Deploy (replace with your app name)
cd server
az webapp deploy \
  --resource-group check-card-game-rg \
  --name check-card-game-server \
  --src-path . \
  --type zip
cd ..
```

**Deploy Client manually:**

```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Build the client with production server URL
VITE_SOCKET_URL=https://check-card-game-server.azurewebsites.net \
  npm run build --workspace=client

# Deploy
swa deploy client/dist \
  --deployment-token <your-deployment-token> \
  --env production
```

---

## Step 5: Verify

1. Open `https://<your-static-web-app>.azurestaticapps.net` in a browser
2. Open browser DevTools > Console — check for connection errors
3. Create a room and join from another tab/device to test multiplayer
4. Check Azure Portal > App Service > **Log stream** for server logs

---

## Environment Variables Summary

### Server (Azure App Service)

| Variable      | Value                       | Required |
| ------------- | --------------------------- | -------- |
| `PORT`        | `8080`                      | Yes      |
| `NODE_ENV`    | `production`                | Yes      |
| `MONGODB_URI` | Cosmos DB connection string | Yes      |
| `CLIENT_URL`  | Static Web App URL          | Yes      |

### Client (Build-time)

| Variable          | Value           | Required |
| ----------------- | --------------- | -------- |
| `VITE_SOCKET_URL` | App Service URL | Yes      |

### GitHub Secrets

| Secret                            | Where to get it                                  |
| --------------------------------- | ------------------------------------------------ |
| `AZURE_SERVER_APP_NAME`           | App Service name (e.g. `check-card-game-server`) |
| `AZURE_SERVER_PUBLISH_PROFILE`    | App Service > Download publish profile (XML)     |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Static Web App > Manage deployment token         |
| `VITE_SOCKET_URL`                 | `https://<app-service-name>.azurewebsites.net`   |

---

## Free Tier Limits

| Service         | Limit                    | Notes                               |
| --------------- | ------------------------ | ----------------------------------- |
| Cosmos DB       | 1000 RU/s, 25 GB         | Sufficient for <50 concurrent users |
| App Service F1  | 60 CPU min/day, 1 GB RAM | App may sleep after inactivity      |
| Static Web Apps | 100 GB bandwidth/month   | More than enough for a card game    |

### If Free Tier Isn't Enough

- **App Service**: Upgrade to B1 ($13/month) for always-on + more CPU
- **Cosmos DB**: Switch to MongoDB Atlas free tier (512 MB) if RUs are exhausted
- **Alternative server hosts**: Render (free, auto-sleep) or Railway ($5/month credit)

---

## Troubleshooting

### Server won't start

- Check **Log stream** in Azure Portal for error messages
- Verify `MONGODB_URI` is correct and includes the database name
- Verify **Web sockets** is enabled in App Service settings

### WebSocket connection fails

- Ensure `CLIENT_URL` matches the exact Static Web App URL (including `https://`)
- Ensure **Web sockets** is turned on in App Service > Configuration > General settings
- Check browser console for CORS errors

### Database connection fails

- Verify the Cosmos DB firewall allows Azure services (Settings > Networking > "Allow access from Azure services")
- Check the connection string format includes `/check-card-game?` before query params

### Cold start delay

- Free tier App Service sleeps after ~20 min inactivity
- First request after sleep takes 20-30 seconds — this is normal
- Upgrade to B1 tier for "Always On" if this is a problem
