# TermChat Architecture — Every File Explained

This document walks through **every file** in the repo, what it does, and how the pieces connect. Read it top to bottom and you'll understand the whole app.

- [How the app is split](#how-the-app-is-split)
- [Backend: the server](#backend-the-server)
  - [`index.js`](#indexjs)
  - [`src/app.js`](#srcappjs)
  - [`src/config/db.js`](#srcconfigdbjs)
  - [`src/routes/health.js`](#srcrouteshealthjs)
  - [`src/models/User.js`](#srcmodelsuserjs)
  - [`src/models/Message.js`](#srcmodelsmessagejs)
  - [`src/sockets/chatSocket.js`](#srcsocketschatsocketjs)
- [Client: the terminal UI](#client-the-terminal-ui)
  - [Boot pipeline](#boot-pipeline-binregisterjsx-loaderindex)
  - [`client/src/socket.js`](#clientsrcsocketjs)
  - [`client/src/session.js`](#clientsrcsessionjs)
  - [`client/src/App.jsx`](#clientsrcappjsx)
  - [`client/src/commands.js`](#clientsrccommandsjs)
  - [`client/src/components/AuthScreen.jsx`](#clientsrccomponentsauthscreenjsx)
  - [`client/src/components/ChatScreen.jsx`](#clientsrccomponentschatscreenjsx)
  - [`client/src/components/Sidebar.jsx`](#clientsrccomponentssidebarjsx)
  - [`client/src/components/StatusBar.jsx`](#clientsrccomponentsstatusbarjsx)
  - [`client/src/components/MessageFeed.jsx`](#clientsrccomponentsmessagefeedjsx)
  - [`client/src/components/TypingIndicator.jsx`](#clientsrccomponentstypingindicatorjsx)
  - [`client/src/components/InputBox.jsx`](#clientsrccomponentsinputboxjsx)
  - [`client/src/utils/colorFromUsername.js`](#clientsrccomponentscolorfromusernamejs)
- [Shared infrastructure](#shared-infrastructure)
- [Core flows, end to end](#core-flows-end-to-end)
- [Gotchas and design decisions](#gotchas-and-design-decisions)

---

## How the app is split

Two processes:

1. **Backend** (repo root) — Express + Socket.IO + MongoDB. Stateless UI, owns all data.
2. **Client** (repo root `client/`) — a terminal UI built with **ink**. It never touches MongoDB; it talks to the backend only over WebSockets (socket.io-client).

```
┌──────────────┐   Socket.IO (WebSocket, JSON)   ┌──────────────────────────┐
│  termchat    │ ──────────────────────────────► │  Node + Express          │
│  (ink CLI)   │ ◄────────────────────────────── │  Socket.IO               │
└──────────────┘                                 │  MongoDB (Mongoose)      │
                                                 └──────────────────────────┘
```

The client renders with **ink** — React for terminals. `Box`/`Text` are layout primitives; components re-render whenever state changes, exactly like React on the web. Because Node can't run `.jsx` natively, the client uses a tiny ESM loader that transpiles JSX **on the fly** with esbuild — no build step, the source files are the running code.

---

## Backend: the server

### `index.js`

The entry point. Steps:

1. `dotenv.config(...)` — loads `.env` (root level).
2. `http.createServer(app)` — the Express app from `src/app.js` becomes the HTTP server.
3. `new Server(httpServer, {...})` — attaches Socket.IO:
   - `cors: { origin: "*" }` — any client may connect.
   - `pingInterval: 5000, pingTimeout: 3000` — heartbeat every 5s; if a client misses 3s of pings it's considered dead. This makes dead connections noticeable in **~8 seconds** instead of the default ~45s. Important for a chat app so "online" state and typing indicators don't go stale.
4. `io.on("connection", ...)` — every new socket calls `registerChatHandlers(io, socket)` (see `chatSocket.js`).
5. `connectDB().then(...)` — wait for MongoDB, **then** start listening on `PORT` (default 4000). The server won't accept traffic until the DB is reachable.

### `src/app.js`

The Express app: `express.json()` middleware (parses JSON bodies for HTTP routes) and the `/health` router. Everything else the app does is WebSocket-based, so this file stays tiny.

### `src/config/db.js`

`connectDB()` — `mongoose.connect(process.env.MONGODB_URI)`. If the connection fails, it logs the error and calls `process.exit(1)` (fail fast: no point serving a chat app without a database).

### `src/routes/health.js`

`GET /health` → `{ status: "ok" }`. Used by deployment checks and scripts to confirm the server is alive.

### `src/models/User.js`

The Mongoose schema for a user account:

| Field | Type | Notes |
| ----- | ---- | ----- |
| `username` | String | required, **unique**, trimmed |
| `passwordHash` | String | scrypt hash of the password (64 bytes, hex). **Not required** on purpose — see "placeholder users" below |
| `salt` | String | random 16-byte salt, hex |
| `socketId` | String | which socket is currently connected as this user |
| `status` | String | `online` / `offline` |
| `unread` | Map<String, Number> | `{ "dm:bob_alice": 2 }` — unread count per room |
| `token` | String | the current session token, or `null` after logout |
| `createdAt` | Date | signup time |

Two exported pieces of logic:

- `hashPassword(password, salt)` — `scryptSync(password, salt, 64).toString("hex")`. Node's built-in scrypt; no external crypto libraries.
- `verifyPassword(password)` (a schema **method**, so it exists on user documents) — re-hashes the input with the user's own salt and compares with `crypto.timingSafeEqual`, which compares in constant time so timing can't leak password info.

**Why are `passwordHash`/`salt`/`socketId` optional?** When you `/dm someone_who_never_registered`, the server creates a *placeholder* user doc so the unread counter has somewhere to live. That doc has no password yet. When the person finally registers, the placeholder is "claimed" and upgraded with a real hash — see `chatSocket.js`.

### `src/models/Message.js`

The chat message schema — deliberately minimal:

| Field | Type | Notes |
| ----- | ---- | ----- |
| `username` | String | sender |
| `text` | String | the message body (trimmed) |
| `room` | String | `"general"` by default, or a DM room id |
| `createdAt` | Date | when sent (drives the `HH:MM` timestamps) |

A DM room id is `dm:<two usernames sorted alphabetically>` joined with `_`, e.g. `dm:alice_bob`. Sorting both names means Alice and Bob always compute the **same** id, so their messages land in the same collection.

### `src/sockets/chatSocket.js`

**The heart of the app — all chat logic lives here.** One function, `registerChatHandlers(io, socket)`, runs once per connection and wires up every event handler. Let's go through it top to bottom.

#### Module-level helpers

- `USERNAME_RE` — usernames must be 2-24 chars of `[a-zA-Z0-9_]`.
- `dmRoom(a, b)` — exported helper: `dm:${[a, b].sort().join("_")}`. Both the server and client use it so room ids always agree.
- `newToken()` — `crypto.randomBytes(32).toString("hex")` → a 64-char session token.
- `safeEqual(a, b)` — constant-time token comparison (`timingSafeEqual` needs equal-length buffers, so lengths are checked first).

#### Per-socket state

- `authedSockets` (a `Set` of socket ids) — gates everything: you cannot `user:join` or send messages until you've authenticated. This is why a raw socket connecting from a script can't join the chat.
- `announced.current` — a flag so the server only broadcasts "X joined" **once per socket session**, not on every room switch.

#### `auth:register`

1. Validates username (`USERNAME_RE`) and password (min 4 chars).
2. Looks up the username. If a doc exists **with a passwordHash**, the name is taken → error.
3. Otherwise it **claims** the name: `findOneAndUpdate(..., { upsert: true })` with the scrypt hash, salt, socketId, and a fresh token. This is the placeholder-claiming logic from `User.js`.
4. Marks the socket authed and replies `auth:success { username, token }`.

#### `auth:login`

Finds the user, verifies the password (guarding against placeholder docs that have no hash). On success it **rotates the token** (new random one) and replies with it. Rotating means: logging in on a second machine silently revokes the first machine's session — one active session per account.

#### `auth:token`

Session resume. Looks up the user and compares the stored token with the presented one via `safeEqual`. Success → `auth:success { username, token }` (the same token, not a new one). This is what makes "the app remembers me" work.

#### `auth:logout`

`updateOne({ username, token }, { $set: { token: null } })` — only matches if the token is valid (so a random socket can't log someone else out). The token is now dead forever; any saved session file becomes useless.

#### `canJoin(room, username)`

Permission check: `"general"` is open; a `dm:` room is joinable **only if this username is one of the two participants**.

#### `user:join`

The main "enter a room" flow:

1. Rejects if not authed.
2. Validates `canJoin`.
3. `socket.join(room)` — joins the socket.io room (io rooms = broadcast groups).
4. Upserts the user: `{ socketId, status: "online" }`.
5. **Resets unread for that room** to 0 (`unread.<room> = 0`) and tells the client `unread:update { room, unread: 0 }`.
6. Sends `message:history` — the last 20 messages of the room, oldest first.
7. Sends `rooms:list` — the full sidebar built by `buildRoomList` (below).
8. If this is the first join of the session, broadcasts `user:joined` and refreshes the online count.

#### `user:leave`

Simply `socket.leave(room)` — leaving the io room so the user stops receiving broadcasts from it.

#### `message:send`

1. Validates username/text and `canJoin`.
2. `Message.create({ username, text, room })` — persisted first; if the DB write fails nothing is broadcast.
3. `io.to(room).emit("message:new", ...)` — everyone in the room, **including the sender** (the client renders its own message from this echo — one code path for all messages).
4. **Unread accounting**:
   - DM room → the *other participant* only. `updateOne(..., { $inc: { unread.<room>: 1 } }, { upsert: true })` — the upsert is what creates a **placeholder user** if the recipient never registered. This is how a DM to a future user still shows as unread when they finally sign up.
   - General → every user except the sender (`updateMany`).
5. Notifies **online users who are not currently viewing that room** with `unread:update` (only if their socket is connected and not a member of the room). If they're in the room, their unread is 0 anyway.

#### `typing:start` / `typing:stop`

Relayed with `socket.to(room)` — scoped to the room, everyone *except* the sender. Includes the room in the payload so clients can ignore typing from other rooms.

#### `users:list` and `broadcastPresence`

Leftovers from the earlier "presence" feature. The UI no longer shows who's online, but the server still tracks `status` and can answer a `users:list` query — useful for other/future clients. `broadcastPresence(io)` counts online users and emits `presence:update` to everyone.

#### `disconnect`

Marks the user `offline`, broadcasts `user:left` to everyone else (clients use this to clean up stale typing indicators), and refreshes the presence count.

#### `buildRoomList(io, username)`

Builds the sidebar payload: always `# general`, plus every **DM room with unread > 0** (`dm:` prefix, count > 0). This is the mechanism behind "I open the app and see I have a message": a user who was offline while a DM arrived gets the room here with its badge when they next connect. (Rooms you've already visited aren't listed after a restart — only ones with pending unread.)

---

## Client: the terminal UI

### Boot pipeline: `bin/termchat.js` → `register.mjs` → `jsx-loader.mjs` → `index.js`

- **`client/bin/termchat.js`** — the executable behind the global `termchat` command (wired up by `"bin"` in `client/package.json` + `npm link`). It:
  1. Registers the JSX loader (`node:module.register`).
  2. Parses `--server <url>` and sets `TERMCHAT_URL` (so the flag works even though `socket.js` reads the env var).
  3. Imports `../index.js` (kept a `.js` file so the loader skips it).
- **`client/register.mjs`** — one line: `register("./jsx-loader.mjs", import.meta.url)`. It's the `--import` target used by `npm start`.
- **`client/jsx-loader.mjs`** — the custom ESM loader. For every import that ends in `.jsx`, it reads the file, runs it through **esbuild** (`loader: "jsx"`, automatic React runtime, `format: "esm"`), and returns the transpiled module. Everything else passes through to Node normally.
- **`client/index.js`** — clears the terminal (`\x1b[2J\x1b[H`), exits cleanly when stdin closes (helps automated tests; harmless interactively), and `render(<App />)` — plain `createElement`, since this file is `.js`.

Net effect: **zero build step.** Editing `AuthScreen.jsx` and relaunching `termchat` runs the new code immediately.

### `client/src/socket.js`

The **single shared socket.io-client instance**: `io(process.env.TERMCHAT_URL || "http://localhost:4000")`. Every component imports `{ socket }` from here — there is exactly one connection per app instance. Socket.IO's client automatically reconnects with backoff, which the app leans on heavily.

### `client/src/session.js`

Local session persistence. Three functions:

- `readSession()` — reads `~/.termchat/session.json`, returns `{ username, token }` or `null`.
- `writeSession({ username, token })` — creates `~/.termchat` if needed and writes the file with mode `0600` (owner-only; it contains a credential).
- `clearSession()` — deletes the file.

### `client/src/App.jsx`

The root component. Owns one piece of state: `credentials` (`null` = logged out).

- `null` → render `<AuthScreen onLogin={setCredentials} />`.
- set → render `<ChatScreen ... />`.

Also defines two handlers:
- `handleQuit` — `/q` or Ctrl+C: `socket.close()` then `useApp().exit()` (ink's graceful shutdown restores the terminal).
- `handleLogout` — emits `auth:logout` (so the server kills the token), `clearSession()`, and flips `credentials` back to `null` → the app returns to the login screen **without restarting**.

### `client/src/commands.js`

The command registry: `COMMANDS` (array of `{ name, description }`) and `matchCommands(prefix)` (filters commands whose name starts with the prefix — powers both the palette and command completion).

### `client/src/components/AuthScreen.jsx`

The login/register form. State: `mode` (login/register), `username`, `password`, `focus` (which field is active), `error`, `busy`.

Key behaviors:

- **Session resume on mount**: the effect first checks `readSession()`. If a session exists, it emits `auth:token` and shows busy dots instead of waiting for the form. On `auth:success` it saves the session and calls `onLogin`. On `auth:error` (including a dead token) it clears the session and shows the error — you fall back to the form naturally.
- **After any successful auth** (`auth:success`): `writeSession(...)` then `onLogin(...)`.
- **Tab** toggles login ↔ register.
- **Enter moves focus**: username → password → submit.
- **The Enter-in-chunk handling** (`handleUsernameChange` / `handlePasswordChange`): ink keeps `\r` *inside* text chunks for paste support, so a fast-typed Enter arrives as part of the value, not as a keypress. These handlers split on `[\r\n]`: act on the text *before* the newline, and keep typing the remainder.
- **Password masking** via `mask="•"`.
- **The `onSubmit={() => submit()}` subtlety**: ink-text-input calls `onSubmit(value)` with the field's current contents. The old code was `onSubmit={submit}` and `submit(name = username, pass = password)` — so the *password text was being passed as the username*, and accounts got registered under their own password. The wrapper ignores the argument and reads state instead.

### `client/src/components/ChatScreen.jsx`

The hub of the UI. State:

| State | What it holds |
| ----- | ------------- |
| `rooms` | `[{ id, type: "channel"|"dm", name, unread }]` — the sidebar |
| `currentRoom` (+ `currentRoomRef`) | the open room id; the ref is kept in sync so async socket handlers always read the *current* value without re-subscribing |
| `entries` | the visible feed (`message` or `system` entries) |
| `typingUsers` | `Set` of usernames typing in the current room |
| `disconnected` | shows the yellow reconnect banner |
| `sidebarFocused` / `selectedIndex` | keyboard navigation state |

Exports `dmRoomId(a, b)` (same convention as the server) and `peerOf(room, username)` (the other participant of a DM room).

Key logic:

- **`handleCommand(name, raw)`** — implements `/help` (system message with the command list), `/dm <user>` (validates, guards against self-DM, then `switchRoom(dmRoomId(...))`), `/logout`, `/q`, and the unknown-command message.
- **`switchRoom(room)`** — the room-change sequence, and the ordering matters:
  1. if it's already the current room, do nothing;
  2. `user:leave` the old room;
  3. clear the feed and typing set (fresh state for the new room);
  4. `user:join` the new room (the server replies with that room's history + `rooms:list` + a unread reset);
  5. add the room to the sidebar if it's not there yet.
- **The mount `useEffect`** — attaches **all** listeners first, *then* emits `user:join { room: "general" }`. Order matters: if the emit happened before the listeners, the history reply would arrive with no handler and be lost forever.
  - Most handlers are **room-scoped**: `message:new` and `typing:update` ignore anything whose `room` doesn't match `currentRoomRef.current`. `message:history` likewise ignores replies for a room the user already left (a stale reply can't clobber the feed).
  - `unread:update` updates the sidebar badge, and if a DM room isn't in the sidebar yet, creates it with the badge.
  - `onConnect` (auto-reconnect): re-auths with the stored password and re-joins the current room; the server re-sends history so the feed heals itself after a drop.
  - `user:left` is used only to prune stale typing indicators.
- **Layout**: `Sidebar` | (`StatusBar` + `MessageFeed` + `TypingIndicator` + reconnect banner + `InputBox`). Placeholder text switches between `Message #general` and `Message @peer`.

### `client/src/components/Sidebar.jsx`

Renders the sidebar from `items` (split into CHANNELS and DIRECT MESSAGES sections):

- channels show `# name` (bold when open, cyan when active);
- DMs show the peer's name, `@` prefix only when open;
- unread badges render as yellow `(n)`;
- `▸` marks the hovered item.

Keyboard (only when the sidebar has focus — `isActive: active`): `↑/↓` navigate, `Enter` opens the room **and** returns focus to the input, `Tab`/`Esc` return focus to the input. Everything else is delegated by ink to the input.

### `client/src/components/StatusBar.jsx`

Two lines: `● # general` (or `@ name`; green dot when connected, red when not) and a thin `─` separator that spans the terminal width (`useStdout().stdout.columns`).

### `client/src/components/MessageFeed.jsx`

Renders the last 20 entries (sliding window — `entries.slice(-20)`), each as `HH:MM username text` with the username colored via `colorFromUsername`. `system` entries (command output, errors) render dim italic. All messages are left-aligned — no right column.

### `client/src/components/TypingIndicator.jsx`

If `users` is empty, renders a single space — a **reserved line** so the layout never jumps when a typing indicator appears. Otherwise: `name1, name2 are typing.` with a 400ms interval animating `1→2→3` dots.

### `client/src/components/InputBox.jsx`

The text input plus command palette. Behavior:

- **Command palette**: when the value starts with `/`, `matchCommands(value)` fills a popup above the input. `↑/↓` cycle, `Tab` completes the selected command (e.g. `/dm ` ready for an argument), `Esc` clears. ink-text-input ignores arrow keys, so there's no conflict.
- **Typing debounce**: first keystroke emits `typing:start` once; each subsequent keystroke resets a 1.5s timer (`TYPING_DEBOUNCE_MS`); when it fires, `typing:stop` is emitted. Sending a message stops typing immediately.
- **`handleChange`** — the Enter-in-chunk split (same trick as AuthScreen): if a `\r`/`\n` arrives inside the text, submit the part before it and keep the rest as new input.
- **`handleSubmit(text)`** — distinguishes three cases:
  1. starts with `/` and matches a command (`exact` or `command + space` prefix — so `/dm bob` matches `/dm` but `/dmx` doesn't) → `onCommand(name, raw)`;
  2. starts with `/` but unknown → `onCommand("unknown", raw)`;
  3. otherwise → `onSend(text)`.
- **Focus handoff**: `Tab` with the palette closed calls `onFocusToggle` → the sidebar takes over. The `active` prop gates whether the input receives keystrokes.

### `client/src/utils/colorFromUsername.js`

Turns a username into a stable color: hash the characters (multiplicative `*31`), mod the palette length. Same user, same color, every session; different users usually differ.

---

## Shared infrastructure

### `scripts/freshdb.js` (`npm run freshdb`)

Connects with the same `.env` `MONGODB_URI` and calls `dropDatabase()` — a hard reset of users and messages. **Safety guard**: refuses to run against anything that isn't `mongodb://localhost`/`127.0.0.1` unless you pass `--yes` (so you can't accidentally wipe a production Atlas database).

### `render.yaml` + `DEPLOYMENT.md`

`render.yaml` is the Render Blueprint: one web service, `npm start`, `MONGODB_URI` as a `sync: false` secret (typed in during the Blueprint flow, never committed). `DEPLOYMENT.md` is the human step-by-step for Atlas + Render.

### `.env` / `.env.example`

`PORT` and `MONGODB_URI` (default `mongodb://localhost:27017/termchat`).

---

## Core flows, end to end

### Registering

```
user types username+password → AuthScreen submit → auth:register
server: validate → claim name (or placeholder) → hash with scrypt → save → auth:success {username, token}
client: writeSession → App flips to ChatScreen → user:join general → history + rooms:list → chat UI
```

### Remembering you

```
launch termchat → AuthScreen mounts → readSession finds {username, token}
→ auth:token → server compares stored token → auth:success → straight into ChatScreen (no form)
```

### DM with unread badge (both offline and never-registered recipients)

```
alice: /dm bob → switchRoom("dm:alice_bob") → user:join
alice sends "hi" → message:send → persisted + broadcast to room + unread.inc("dm:alice_bob") on bob
  (bob's doc may be created on the fly if he doesn't exist yet!)
bob launches termchat later → registers (claims placeholder) → user:join general
→ buildRoomList includes dm:alice_bob with unread=1 → sidebar shows "bob(1)"-style badge "alice (1)"
→ bob opens it (sidebar Enter) → unread reset → history shows "hi"
```

### Sending a message (normal case)

```
InputBox submit → ChatScreen.handleSend → message:send {username, text, room}
server: persist → io.to(room).emit message:new → everyone in the room appends it (sender included)
```

### Typing indicator

```
keystroke → typing:start (once) → 1.5s of silence → typing:stop
server relays to everyone else in the room → client Set → "bob is typing..." with animated dots
```

### Logging out

```
/logout → App.handleLogout → auth:logout (server nulls the token) + clearSession()
→ credentials = null → AuthScreen renders again, in the same process
```

### Reconnect after a dropped connection

```
heartbeat fails → client disconnect → banner "Disconnected from server..."
socket.io auto-reconnects → connect fires → ChatScreen re-auths (password) + user:join current room
→ server re-sends history → the feed self-heals
```

---

## Gotchas and design decisions

- **Enter-in-chunk (ink paste support)** — ink keeps `\r` inside text chunks, so a fast-typed Enter is *text*, not a keypress. Two places split on `[\r\n]` (`AuthScreen`, `InputBox`); without this, fast typing/pasting corrupted input. This is also why tests must send input slowly, one chunk at a time.
- **`onSubmit(value)` trap** — ink-text-input passes the current value to `onSubmit`. Any handler with default params will silently swallow it (the password-as-username bug).
- **Listeners before emits** — ChatScreen attaches all socket listeners in `useEffect` *before* emitting `user:join`; otherwise the history reply races ahead of the handlers and is lost.
- **Refs for async handlers** — socket callbacks close over render-scope values; `currentRoomRef` is kept in sync so handlers always act on the current room without re-subscribing on every room change.
- **The socket is a singleton** — `socket.js` exports one instance; importing it anywhere is importing the same connection. Never create a second `io()`.
- **One-way message rendering** — the client renders both its own and others' messages from the `message:new` echo; there's no optimistic-send code path.
- **Unread is DB-side** — because unread counts live on the user doc, offline users (and even never-registered users, via upsert placeholders) accrue badges correctly.
- **Tokens are rotated on every login** — one active session per account; re-logging-in elsewhere revokes the previous device.
- **`socketId` on the user doc** — used for targeted `unread:update` emits. It's a single slot, so two simultaneous connections *from the same user* (same account on two terminals) will fight over it; the room broadcast still works for both, only the targeted unread push goes to one.
- **No message length cap / rate limiting** — currently everything is accepted; a spammer could flood the DB. Reasonable next hardening step.
