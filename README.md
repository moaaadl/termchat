# TermChat

A real-time **terminal chat app** with a Node.js + Socket.IO + MongoDB backend and a full **ink** (React for terminals) CLI client. Register an account once, stay logged in across launches, chat in `#general`, and send private DMs that show unread badges — all from your terminal.

## Features

- **Accounts** — register/login with scrypt-hashed passwords, username validation
- **Persistent sessions** — the app remembers you between launches via a token; `/logout` forgets it
- **Channels & DMs** — `#general` plus private DMs via `/dm <username>` or the sidebar
- **Unread badges** — `(n)` counts next to DMs; works even if the recipient isn't registered yet or is offline
- **Message history** — last 20 messages per room, persisted in MongoDB
- **Typing indicators** — "X is typing..." with animated dots, per room
- **Command palette** — type `/` for live command hints, `↑/↓` + `Tab` to complete
- **Resilient** — auto-reconnect with re-auth, fast heartbeat (dead server noticed in ~8s)

## Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Backend  | Node.js (ESM), Express, Socket.IO |
| Database | MongoDB + Mongoose ODM |
| Client   | ink (React for terminals), ink-text-input, socket.io-client, esbuild (dev-time JSX transform) |

## Quick Start (local)

Prereqs: Node.js >= 18, MongoDB running locally (e.g. `mongostart` alias → `mongod --dbpath ... --port 27017`).

```bash
# --- Backend (repo root) ---
npm install
cp .env.example .env          # defaults to mongodb://localhost:27017/termchat
npm run dev                   # or npm start — server on :4000

# --- Client (client/) ---
npm install
npm link                      # makes the global `termchat` command
npm start                     # or just: termchat
```

Verify the server: `curl http://localhost:4000/health` → `{"status":"ok"}`

Open two terminals, run `termchat` in both, register two accounts (Tab to switch Login/Register), and chat.

Point the client at a remote server: `termchat --server https://termchat.onrender.com` (or `TERMCHAT_URL=... npm start`).

## Usage

### Keys

| Key | Action |
| --- | ------ |
| `Tab` | Toggle focus: input ↔ sidebar |
| `↑` / `↓` | Navigate sidebar (or command palette) |
| `Enter` | Open selected room / send message |
| `Esc` | Close the command palette / back to input |
| `Ctrl+C` | Quit |

### Commands

| Command | Description |
| ------- | ----------- |
| `/dm <username>` | Open a private chat with that user |
| `/help` | List all commands |
| `/logout` | Log out and forget this session |
| `/q` | Quit TermChat |

## How sessions work

On successful login/register the server issues a random token (stored in the user doc) and returns it. The client saves `{ username, token }` to `~/.termchat/session.json` (mode 0600). On launch it sends `auth:token`; a match skips the login screen. `/logout` deletes the file and invalidates the token server-side. Logging in on another machine rotates the token, revoking the old one.

## Project Structure

```
termchat/
├── index.js                 # Entry: HTTP + Socket.IO server, heartbeats
├── src/
│   ├── app.js               # Express app + middleware + routes
│   ├── config/db.js         # Mongoose connection
│   ├── models/
│   │   ├── User.js          # username, scrypt password, socketId, status,
│   │   │                    # unread Map, session token
│   │   └── Message.js       # username, text, room, createdAt
│   ├── routes/health.js     # GET /health
│   └── sockets/
│       └── chatSocket.js    # ALL chat logic: auth, rooms, DMs, unread, typing
├── scripts/freshdb.js       # npm run freshdb — wipe the local database
├── client/                  # the terminal UI (ink)
│   ├── bin/termchat.js      # global CLI entry (--server flag)
│   ├── index.js             # render <App/>
│   ├── register.mjs         # hooks the JSX loader
│   ├── jsx-loader.mjs       # esbuild: .jsx -> ESM at runtime (no build step)
│   └── src/
│       ├── App.jsx          # AuthScreen <-> ChatScreen switch, quit/logout
│       ├── socket.js        # the single shared socket.io-client instance
│       ├── session.js       # read/write/clear ~/.termchat/session.json
│       ├── commands.js      # /help /dm /logout /q definitions
│       ├── components/
│       │   ├── AuthScreen.jsx     # login/register form + session resume
│       │   ├── ChatScreen.jsx     # hub: listeners, rooms, unread, switching
│       │   ├── Sidebar.jsx        # channels + DMs with unread badges
│       │   ├── StatusBar.jsx      # "● # general" + separator
│       │   ├── MessageFeed.jsx    # last 20 messages, colored usernames
│       │   ├── TypingIndicator.jsx# "X is typing..."
│       │   └── InputBox.jsx       # input, command palette, typing debounce
│       └── utils/colorFromUsername.js  # stable color per username
├── render.yaml              # Render Blueprint (free-tier deploy)
├── DEPLOYMENT.md            # full Atlas + Render guide
└── ARCHITECTURE.md          # what every file does, in detail
```

## Database

### `users`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `username` | String | unique, 2-24 chars `[a-zA-Z0-9_]` |
| `passwordHash`, `salt` | String | scrypt (64 bytes), hex |
| `socketId` | String | current connection (for targeted emits) |
| `status` | String | `online` / `offline` |
| `unread` | Map<String, Number> | unread count per room |
| `token` | String | current session token (null = logged out) |

### `messages`

| Field | Type | Notes |
| ----- | ---- | ----- |
| `username` | String | sender |
| `text` | String | message body (trimmed) |
| `room` | String | `general` or `dm:<a>_<b>` (participants sorted) |
| `createdAt` | Date | timestamp |

## Socket.IO Event API

All payloads are trimmed; invalid input replies with `error: { message }`.

### Client → Server

| Event | Payload | Purpose |
| ----- | ------- | ------- |
| `auth:register` | `{ username, password }` | Create account (claims placeholder users created by DMs) |
| `auth:login` | `{ username, password }` | Log in, issue a fresh token |
| `auth:token` | `{ username, token }` | Resume a saved session |
| `auth:logout` | `{ username, token }` | Invalidate the token |
| `user:join` | `{ username, room }` | Join a room: gets history, resets unread, updates rooms:list |
| `user:leave` | `{ username, room }` | Leave a room |
| `message:send` | `{ username, text, room }` | Persist + broadcast + bump unread counters |
| `typing:start` / `typing:stop` | `{ username, room }` | Typing indicator |

### Server → Client

| Event | Payload | When |
| ----- | ------- | ---- |
| `auth:success` | `{ username, token }` | Any successful auth |
| `auth:error` | `{ message }` | Failed auth |
| `message:history` | `Message[]` (last 20, oldest first) | On `user:join` |
| `message:new` | `{ username, text, room, timestamp }` | On send — to everyone in the room |
| `rooms:list` | `{ rooms: [{ id, type, name, unread }] }` | On `user:join` |
| `unread:update` | `{ room, unread }` | Unread changed while not viewing the room |
| `typing:update` | `{ username, room, isTyping }` | To everyone else in the room |
| `user:joined` / `user:left` | `{ username }` | Once per session connect / on disconnect |
| `presence:update` | `{ online }` | Online count (kept server-side) |
| `error` | `{ message }` | Bad input or handler failure |

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm start` | Run the server |
| `npm run dev` | Run with Nodemon (auto-restart) |
| `npm run freshdb` | **Wipe the whole database** (refuses non-local URIs unless `-- --yes`) |

## Docs

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — file-by-file explanation of the whole codebase (start here to learn how it all works)
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — step-by-step Atlas + Render deployment
