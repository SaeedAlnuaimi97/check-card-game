# MongoDB Local Setup Guide

How to install and run MongoDB locally for development.

The server defaults to `mongodb://localhost:27017/check-card-game` when no
`MONGODB_URI` environment variable is set, so no extra configuration is needed
once MongoDB is running.

---

## Option 1: Install MongoDB Community Edition

### macOS (Homebrew)

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

To stop: `brew services stop mongodb-community`

### Ubuntu / Debian

```bash
# Import the public key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add the repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org

# Start the service
sudo systemctl start mongod
sudo systemctl enable mongod   # start on boot
```

### Windows

Download and run the MSI installer from
https://www.mongodb.com/try/download/community and follow the setup wizard.
Select **Install MongoDB as a Service** to have it start automatically.

---

## Option 2: Run MongoDB with Docker (no installation required)

```bash
docker run -d \
  --name mongodb \
  -p 27017:27017 \
  mongo:7
```

To stop: `docker stop mongodb`  
To start again: `docker start mongodb`

---

## Verify MongoDB is running

```bash
mongosh --eval "db.runCommand({ ping: 1 })"
# Expected output: { ok: 1 }
```

---

## Configure the server

The server reads the `MONGODB_URI` environment variable. For local development
the default value is already correct, but you can set it explicitly in
`server/.env`:

```env
MONGODB_URI=mongodb://localhost:27017/check-card-game
```

If your local instance uses authentication, use:

```env
MONGODB_URI=mongodb://username:password@localhost:27017/check-card-game
```

---

## Start the development server

```bash
# From the repo root
npm run dev --workspace=server
```

The server health endpoint confirms the database connection:

```
GET http://localhost:3001/health
```

A healthy response includes `"mongodb": "connected"`.

---

## Troubleshooting

| Symptom                                              | Likely cause                   | Fix                                                                     |
| ---------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `MongooseServerSelectionError: connect ECONNREFUSED` | MongoDB not running            | Start the service (see above)                                           |
| `Authentication failed`                              | Wrong credentials in URI       | Check `MONGODB_URI` in `server/.env`                                    |
| Port 27017 already in use                            | Another process using the port | `lsof -i :27017` to find it, then stop it or change the port in the URI |

For the deployed environment (Azure Cosmos DB for MongoDB), see
[DEPLOYMENT.md](./DEPLOYMENT.md).
