# Check Card Game

A multiplayer online card game for 4-6 players where strategy meets memory. The goal: have the lowest card value sum when someone calls "CHECK"!

## 🎮 Game Overview

- **Players:** 4-6 per game
- **Objective:** Lowest card sum wins each round
- **Win Condition:** First player to reach 100+ points loses the game
- **Special Mechanics:** Red face cards (J/Q/K) have unique abilities
- **Memory Challenge:** Remember your initial 2-card peek throughout the game

## 🚀 Features

- Real-time multiplayer using WebSockets (Socket.io)
- Private room system with shareable codes
- Guest play (no registration required)
- Three distinct turn actions: Draw, Take, or Burn
- Special effects for red Jack, Queen, and King cards
- Dynamic hand sizing (penalties and burns)
- Responsive web design for desktop and mobile

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, Vite, Chakra UI
- **Backend:** Node.js, Express, Socket.io
- **Database:** MongoDB with Mongoose
- **State Management:** React Context API

## 📋 Project Status

**Current Phase:** Project Foundation Complete  
**Version:** 0.1.0 (Pre-MVP)

### Completed
- Monorepo with npm workspaces (client + server)
- TypeScript strict mode for both packages
- Vite dev server with React, Chakra UI, React Router
- Express server with Socket.io
- MongoDB connection with Mongoose
- Health check endpoint (`GET /api/health`)
- ESLint + Prettier configuration
- Concurrent dev scripts (`npm run dev` runs both)
- Environment variable setup (`.env`)

See [PLAN.md](./PLAN.md) for comprehensive development roadmap.  
See [FEATURES.md](./FEATURES.md) for detailed feature checklist.

## 🏗️ Setup Instructions

### Prerequisites

- Node.js (v18+)
- MongoDB (local installation or MongoDB Atlas account)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd check-card-game

# Install dependencies (after monorepo setup)
npm install

# Set up environment variables
cp server/.env.example server/.env
# Edit server/.env with your MongoDB connection string

# Run development servers
npm run dev
```

## 📖 Game Rules

### Card Values
- Red 10s (♥10, ♦10): 0 points
- Aces: 1 point
- 2-9: Face value
- Black 10s (♠10, ♣10): 10 points
- All J/Q/K: 10 points

### Turn Actions
1. **Draw from Deck:** Draw blind, then discard one card
2. **Take from Discard:** Take top visible card, discard from hand
3. **Burn Card:** Match rank with top discard (success = shrink hand, fail = penalty)

### Special Red Cards
- **Red Jack:** Optionally swap one card with any opponent (blind)
- **Red Queen:** Peek at one of your own face-down cards
- **Red King:** Draw 2 cards, choose what to keep/discard

### Ending a Round
- Any player calls "CHECK" at start of their turn
- Play continues until it's the checker's turn again
- All hands revealed, lowest sum wins
- Losers add their sum to total score
- Game ends when someone reaches 100+ points

## 🗂️ Project Structure

```
check-card-game/
├── package.json           # Root workspace config
├── .prettierrc            # Prettier configuration
├── client/                # React frontend (Vite + Chakra UI)
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route pages (HomePage)
│   │   ├── context/       # React Context (game state)
│   │   ├── services/      # Socket.io client
│   │   ├── types/         # TypeScript interfaces
│   │   ├── utils/         # Helper functions
│   │   ├── App.tsx        # Root component with routes
│   │   └── main.tsx       # Entry point
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── server/                # Express + Socket.io backend
│   ├── src/
│   │   ├── models/        # MongoDB schemas
│   │   ├── routes/        # REST endpoints (health)
│   │   ├── socket/        # Socket.io handlers
│   │   ├── game/          # Game logic engine
│   │   ├── utils/         # Database connection, helpers
│   │   └── server.ts      # Entry point
│   ├── .env.example
│   └── tsconfig.json
├── PLAN.md                # Development plan
├── FEATURES.md            # Feature checklist
└── README.md              # This file
```

## 🤝 Contributing

This is currently a personal project. Contributions welcome after MVP launch!

## 📄 License

MIT License (to be added)

## 🔗 Links

- [Development Plan](./PLAN.md)
- [Game Rules (Detailed)](./PLAN.md#complete-game-mechanics)
- GitHub Repository: (to be added)

## 📞 Contact

Created by @azizbek2411

---

**Status:** In active development | **Next Milestone:** Data Models & Types, Room Management
