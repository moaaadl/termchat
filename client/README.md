# TermChat Client

The terminal UI for TermChat. A chat client built with **ink** (React for terminals), **ink-text-input**, and **socket.io-client**. It talks to the TermChat backend (Socket.io server + MongoDB, see `../README.md`) on `http://localhost:4000`.

## Quick start

```bash
# 1. Backend (in termchat/ root)
mongostart
npm run dev          # server on http://localhost:4000

# 2. This client (in client/)
npm install
npm start
```

Open `npm start` in two terminals, pick two usernames, chat. Type `/q` to quit.

## How it runs (no build step)

Node cannot run JSX natively, so `npm start` runs:

```
node --import ./register.mjs index.js
```

- `register.mjs` — registers a custom ESM loader (`node:module.register`)
- `jsx-loader.mjs` — the loader: when Node imports a `.jsx` file, it reads the file, transforms it with **esbuild** (`loader: "jsx"`, automatic runtime), and returns plain ESM. Everything else (`.js`, `.mjs`) goes through Node normally.

Net effect: you write normal JSX components and `node index.js` just works — no bundler, no build step, source files are the live code.

## Architecture

```
┌─────────────┐  Socket.io (WebSocket)  ┌─────────────────────────┐
│   Client    │ ───────────────────────► │        Backend          │
│  (ink UI)   │                          │  Express + Socket.io    │
└─────────────┘                          │  + MongoDB (Mongoose)   │
                                         └─────────────────────────┘
```

```
client/
├── index.js              # Entry: render(<App />) via createElement (plain JS, no JSX)
├── register.mjs          # Registers the JSX loader
├── jsx-loader.mjs        # esbuild JSX -> ESM transform
└── src/
    ├── socket.js         # The single socket.io-client instance (shared everywhere)
    ├── App.jsx           # Top-level: banner, Login <-> ChatScreen switch, /q handler
    ├── components/
    │   ├── Login.jsx     # Username prompt screen
    │   ├── ChatScreen.jsx# Hub: socket listeners + feed state + layout
    │   ├── MessageFeed.jsx      # Renders last 20 messages, colored usernames
    │   ├── TypingIndicator.jsx  # Reserved 1-line "X is typing..."
    │   └── InputBox.jsx  # Text input, typing debounce, send, /q
    └── utils/
        └── colorFromUsername.js  # Hash username -> stable color from palette
```

## Data flow

### Login → Chat

1. `App` renders the banner + `Login`. User types a username, hits Enter.
2. `App` sets `username` state → `Login` unmounts, `ChatScreen` mounts.
3. `ChatScreen` mounts, its `useEffect` runs **in order**: attach all socket listeners FIRST, then `socket.emit("user:join", { username })`. (Order matters — the join reply `message:history` must never beat the listeners.)
4. Server upserts the user, replies with the last 20 messages → `message:history` handler replaces the feed.

### Sending a message

1. `InputBox` submit → `onSend(text)` prop → `ChatScreen.handleSend` → `socket.emit("message:send", { username, text })`.
2. Server persists + broadcasts `message:new` to **everyone** (including sender) → feed appends it.

### Typing indicator (debounced)

- First keystroke in `InputBox` → `typing:start` emitted once.
- Further keystrokes reset a 1.5s timer; if it fires, `typing:stop` is emitted.
- On send (Enter), `typing:stop` is emitted immediately.
- Incoming `typing:update` events add/remove the username from a `Set` → `TypingIndicator` shows "X is typing..." (or an empty reserved line so the layout never jumps).

### Presence

- Someone joins → `user:joined` → dim italic `* username joined the chat *` line.
- Someone disconnects → `user:left` → same, and they're removed from the typing set.

### Disconnects

- The backend heartbeat is tight (`pingInterval: 5s`, `pingTimeout: 3s` in the server's `index.js`) so a dead server is noticed in ~8s.
- `disconnect` → yellow banner "Disconnected from server... waiting for reconnect". No crash.
- On auto-reconnect (`connect` fires again), `ChatScreen` re-emits `user:join` → server upserts user and re-sends history, replacing the feed.

### Quit (`/q`)

- Typing `/q` in the input box → `onQuit` → `App.handleQuit`: `socket.close()` + `useApp().exit()` (ink's graceful unmount restores the terminal). Ctrl+C also works.

## Socket events used

| Direction | Event | Payload | Purpose |
| --------- | ----- | ------- | ------- |
| → server | `user:join` | `{ username }` | Register + get history |
| → server | `message:send` | `{ username, text }` | Send a message |
| → server | `typing:start` / `typing:stop` | `{ username }` | Typing indicator |
| ← server | `message:history` | `[{ username, text, timestamp }]` | Last 20, on join |
| ← server | `message:new` | `{ username, text, timestamp }` | New message (all clients) |
| ← server | `user:joined` / `user:left` | `{ username }` | Presence |
| ← server | `typing:update` | `{ username, isTyping }` | Typing indicator |

## Gotchas (learned the hard way)

- **Keystrokes vs chunks**: ink receives stdin chunks; if a whole line arrives in one chunk it's treated as one paste event and Enter is missed. Real terminals send per-keystroke, so this only bites automated tests — in tests, send each char with a small delay, ending with `\r` (not `\n`).
- **`process.stdin.on("end")`** in `index.js` exists so piped-input tests exit; harmless in interactive use.
- **`index.js` uses `createElement`**, not JSX — it's a `.js` file the loader skips.
- **Never import the socket differently** in components — always `import { socket } from "../socket.js"` so all components share one connection.
