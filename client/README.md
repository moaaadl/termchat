# TermChat Client

The terminal UI for TermChat — a chat client built with **ink** (React for terminals), **ink-text-input**, and **socket.io-client**. It talks to the TermChat backend (see `../README.md`) over WebSockets; it never touches the database directly.

## Quick start

```bash
# 1. Backend (repo root)
mongostart
npm run dev            # server on http://localhost:4000

# 2. This client (in client/)
npm install
npm link               # creates the global `termchat` command
npm start              # or just: termchat
```

Point it at a remote server: `termchat --server https://termchat.onrender.com`, or `TERMCHAT_URL=... npm start`.

## How it runs (no build step)

Node cannot run JSX natively, so the client uses a custom ESM loader:

```
termchat  →  bin/termchat.js   (registers loader, parses --server)
npm start →  node --import ./register.mjs index.js
```

- `register.mjs` — `node:module.register("./jsx-loader.mjs")`
- `jsx-loader.mjs` — for any `.jsx` import: read file → esbuild transform (`loader: "jsx"`, automatic runtime) → plain ESM.

Net effect: source files are the live code. Edit a `.jsx`, relaunch `termchat`, done.

## What's inside

| File | What it does |
| ---- | ------------ |
| `bin/termchat.js` | Global CLI entry (`--server <url>` → `TERMCHAT_URL`) |
| `index.js` | Clear screen, render `<App/>`, exit on stdin EOF |
| `register.mjs` / `jsx-loader.mjs` | The JSX loader |
| `src/socket.js` | The **single** shared socket.io-client instance |
| `src/session.js` | Read/write/clear `~/.termchat/session.json` (remember me) |
| `src/App.jsx` | AuthScreen ↔ ChatScreen switch; quit & logout handlers |
| `src/commands.js` | `/help`, `/dm`, `/logout`, `/q` + matching |
| `src/components/AuthScreen.jsx` | Login/register form, session resume, masked password |
| `src/components/ChatScreen.jsx` | Hub: rooms, unread, room switching, all socket listeners |
| `src/components/Sidebar.jsx` | Channels + DMs with `(n)` unread badges, keyboard nav |
| `src/components/StatusBar.jsx` | `● # general` + separator line |
| `src/components/MessageFeed.jsx` | Last 20 messages, `HH:MM name text`, colored usernames |
| `src/components/TypingIndicator.jsx` | Animated "X is typing..." (reserved line, no layout jump) |
| `src/components/InputBox.jsx` | Text input, command palette, typing debounce |
| `src/utils/colorFromUsername.js` | Hash → stable color per username |

## Keys & commands

| Key | Action |
| --- | ------ |
| `Tab` | Input ↔ sidebar |
| `↑` / `↓` | Navigate sidebar / command palette |
| `Enter` | Open room or send message |
| `Esc` | Close palette / back to input |

| Command | Action |
| ------- | ------ |
| `/dm <user>` | Open a private chat |
| `/help` | List commands |
| `/logout` | Forget this session (token invalidated server-side) |
| `/q` | Quit |

## How sessions work

On login/register the server returns a token; the client saves `{ username, token }` to `~/.termchat/session.json`. On launch it tries `auth:token` first — if valid, you skip the login screen. `/logout` deletes the file and nulls the token server-side.

## Data flow in five steps

1. **Auth** — `auth:register` / `auth:login` / `auth:token` → `auth:success` → session saved → App shows ChatScreen.
2. **Join** — ChatScreen attaches listeners **first**, then emits `user:join { room }`. Server replies `message:history` + `rooms:list`.
3. **Send** — InputBox → `message:send` → server persists and echoes `message:new` to the whole room; the feed appends it.
4. **DMs & unread** — `/dm bob` → join `dm:alice_bob`; incoming messages bump bob's unread on the server; the sidebar badge updates via `unread:update` / `rooms:list`.
5. **Reconnect** — heartbeat drops in ~8s → yellow banner → socket.io auto-reconnects → re-auth + re-join → history re-sent, feed self-heals.

## Socket events used

| Direction | Event | Payload |
| --------- | ----- | ------- |
| → | `auth:register` / `auth:login` / `auth:token` / `auth:logout` | `{username, ...}` |
| → | `user:join` / `user:leave` | `{ username, room }` |
| → | `message:send` | `{ username, text, room }` |
| → | `typing:start` / `typing:stop` | `{ username, room }` |
| ← | `auth:success` / `auth:error` | `{ username, token }` / `{ message }` |
| ← | `message:history` / `message:new` | messages (last 20) / single message |
| ← | `rooms:list` / `unread:update` | sidebar state / badge update |
| ← | `typing:update` | `{ username, room, isTyping }` |

## Gotchas (learned the hard way)

- **Enter-in-chunk**: ink keeps `\r` inside text chunks (paste support), so fast-typed Enter is *text*. `AuthScreen` and `InputBox` split on `[\r\n]`; automated tests must send input slowly with a trailing `\r`.
- **`onSubmit(value)`**: ink-text-input passes the current value to `onSubmit`. Don't write `onSubmit={fn}` where `fn` has default params — it silently swallows the value (this once registered accounts *under their own password*).
- **One socket**: always `import { socket } from "../socket.js"` — never create a second connection.
- **Listeners before emits**: ChatScreen attaches socket listeners before emitting `user:join`, or the history reply gets lost.

For the full file-by-file explanation, see **[ARCHITECTURE.md](../ARCHITECTURE.md)**.
