#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Check Card Game — Deploy Script
# Usage:
#   ./scripts/deploy.sh server    # Deploy server to Azure App Service
#   ./scripts/deploy.sh client    # Deploy client to Azure Static Web Apps
#   ./scripts/deploy.sh all       # Deploy both
# ============================================================

# --- Configuration (edit these) ---
RESOURCE_GROUP="check-card-game-rg"
SERVER_APP_NAME="check-card-game-server"
CLIENT_APP_NAME="check-card-game-client"
SERVER_URL="https://${SERVER_APP_NAME}.azurewebsites.net"
# ----------------------------------

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

deploy_server() {
  echo "==> Building server..."
  npm run build --workspace=server

  echo "==> Preparing deployment package..."
  rm -rf /tmp/server-deploy /tmp/server-deploy.zip
  mkdir -p /tmp/server-deploy
  cp -r "$ROOT_DIR/server/dist" /tmp/server-deploy/dist
  cp "$ROOT_DIR/server/package.json" /tmp/server-deploy/package.json

  echo "==> Installing production dependencies..."
  cd /tmp/server-deploy
  npm install --omit=dev
  zip -qr /tmp/server-deploy.zip dist/ package.json node_modules/
  cd "$ROOT_DIR"

  echo "==> Deploying to Azure App Service..."
  az webapp deploy \
    --name "$SERVER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --src-path /tmp/server-deploy.zip \
    --type zip \
    --async true

  echo "==> Setting startup command..."
  az webapp config set \
    --name "$SERVER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --startup-file "node dist/server.js" \
    --output none

  echo "==> Restarting server..."
  az webapp restart \
    --name "$SERVER_APP_NAME" \
    --resource-group "$RESOURCE_GROUP"

  echo "==> Server deployed: ${SERVER_URL}"

  # Clean up
  rm -rf /tmp/server-deploy /tmp/server-deploy.zip
}

deploy_client() {
  echo "==> Building client..."
  cd "$ROOT_DIR/client"
  VITE_SOCKET_URL="$SERVER_URL" npm run build
  cd "$ROOT_DIR"

  echo "==> Getting deployment token..."
  DEPLOY_TOKEN=$(az staticwebapp secrets list \
    --name "$CLIENT_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.apiKey" -o tsv)

  echo "==> Deploying to Azure Static Web Apps..."
  npx --yes @azure/static-web-apps-cli deploy "$ROOT_DIR/client/dist" \
    --deployment-token "$DEPLOY_TOKEN" \
    --env production

  # Get the actual hostname
  CLIENT_URL=$(az staticwebapp show \
    --name "$CLIENT_APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "defaultHostname" -o tsv)

  echo "==> Client deployed: https://${CLIENT_URL}"
  echo ""
  echo "    Make sure SERVER has CLIENT_URL set to: https://${CLIENT_URL}"
  echo "    Run: az webapp config appsettings set --name $SERVER_APP_NAME --resource-group $RESOURCE_GROUP --settings 'CLIENT_URL=https://${CLIENT_URL}'"
}

case "${1:-}" in
  server)
    deploy_server
    ;;
  client)
    deploy_client
    ;;
  all)
    deploy_server
    deploy_client
    ;;
  *)
    echo "Usage: $0 {server|client|all}"
    exit 1
    ;;
esac
