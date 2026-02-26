# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Monad Game Engine is a full-stack multiplayer 3D browser game (Three.js + Colyseus + Express). For local dev, only two processes are needed — both started by a single `npm run dev` command:

- **Game Server** (Express + Colyseus) on port 3000
- **Vite Dev Server** (frontend HMR) on port 5173

No database, auth credentials, or blockchain config are required. The server uses in-memory storage and guest-only auth by default.

### Running the application

Standard commands are in `package.json` scripts and `README.md`. Key commands:

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start both servers (via `concurrently`) |
| `npm test` | Run Risk game unit tests (`node --test`) |
| `npm run build` | Production build via Vite |

### Important caveats

- **Rollup native module**: After `npm install`, the `@rollup/rollup-linux-x64-gnu` package may not be installed due to a known npm bug with optional dependencies. If `npm run build` fails with "Cannot find module @rollup/rollup-linux-x64-gnu", run `npm install @rollup/rollup-linux-x64-gnu` to fix it.
- **3D renderer**: The client uses Three.js WebGPU with WebGL fallback. In headless/GPU-less environments, Chrome will crash when attempting to render the 3D canvas. The server-side APIs and WebSocket services work fully without a GPU — test backend functionality via `curl` or direct API calls.
- **No lint command**: The project does not have ESLint or a lint script configured. There is no `npm run lint` command.
- **`.npmrc`**: Contains `legacy-peer-deps=true` — peer dependency conflicts are expected and ignored.
- **Environment variables**: Copy `.env.example` to `.env` if needed. All variables are optional for local dev. See `docs/GETTING_STARTED.md` for details.

### Testing backend without a browser

```bash
# Guest auth
curl -X POST http://localhost:3000/api/auth/guest -H "Content-Type: application/json" -d '{"name":"TestPlayer"}'

# World state
curl http://localhost:3000/api/world/state

# Chat
curl -X POST http://localhost:3000/api/chat/send -H "Content-Type: application/json" -d '{"text":"hello"}'

# Create arena
curl -X POST http://localhost:3000/api/arenas -H "Content-Type: application/json" -d '{"name":"Test"}'
```
