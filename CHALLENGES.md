# TermChat Challenges

A ladder of coding challenges for the TermChat app, from beginner to hard. Every challenge is real: it touches actual files in this repo, and you can verify it yourself with two terminals.

## Rules of the game

1. **Work on a branch**: `git checkout -b challenge-<name>`. Commit when you pass your own verification.
2. **You verify** — each challenge ends with "How to verify". No peeking at my solutions (there are none in this file).
3. **If you're stuck >20 minutes**, stop and either:
   - read the relevant file in `ARCHITECTURE.md`, then
   - ask me — I'll give hints, not the code. The point is you write it.
4. **Test loop**: server code changes need a server restart (`pkill -f "node index.js"` then `nohup node index.js > /tmp/termchat-server.log 2>&1 &`). Client changes just need relaunching `termchat`.
5. **Reset data anytime**: `npm run freshdb` in the repo root.

Quick two-terminal test recipe:

```bash
# terminal 1 — server (repo root)
npm run dev

# terminals 2 & 3 — two clients
termchat
```

For testing edge cases (fast typing, sessions), the automated pattern is:

```bash
rm -f /tmp/t.log; (sleep 2; printf "alice\r"; sleep 1; printf "pass123\r"; sleep 3; printf "hello\r"; sleep 2) | script -q /tmp/t.log termchat --server http://localhost:4000
```

(Each character separated by a sleep = realistic keystrokes; trailing `\r` = Enter. See the gotchas in `ARCHITECTURE.md`.)

---

## Level 1 — Beginner (warm up)

These are small, low-risk, and mostly client-side. Do them in any order.

### 1. `/clear` command

**Goal**: typing `/clear` wipes the message feed on screen (only visually — messages stay in the DB).

**Files**: `client/src/commands.js`, `client/src/components/ChatScreen.jsx`

**Hint**: the feed is the `entries` state in `ChatScreen`. A command handler already exists (`handleCommand`) — `/logout` and `/q` show you the pattern of a command with no arguments.

**How to verify**: send a few messages, `/clear`, feed is empty. Send a new message — it appears, history on next launch is intact.

### 2. `/status` command

**Goal**: `/status` prints a system message with your username, the server URL, and your current room.

**Files**: `client/src/commands.js`, `client/src/components/ChatScreen.jsx`, `client/src/socket.js`

**Hint**: the server URL is in `serverUrl` in `socket.js`. You're already holding `username` and `currentRoom` in ChatScreen.

### 3. Welcome message

**Goal**: when you log in / register and land in `#general`, show a dim system line: `* Welcome, alice *` (once per session, not every reconnect).

**Files**: `client/src/components/ChatScreen.jsx`

**Hint**: there's an existing pattern for system entries: `pushSystem(text)`. Where in the mount effect would you fire it only once?

### 4. Live clock in the status bar

**Goal**: the StatusBar shows a live `HH:MM` clock on the right side of the separator line.

**Files**: `client/src/components/StatusBar.jsx`

**Hint**: you need a state that updates every second — look at how `TypingIndicator.jsx` uses `setInterval` + `useEffect`.

**How to verify**: clock ticks every second, resizes correctly with the terminal.

### 5. DM bell

**Goal**: ring the terminal bell (ASCII `\x07`) when a DM message arrives and you're NOT viewing that room.

**Files**: `client/src/components/ChatScreen.jsx`

**Hint**: `process.stdout.write("\x07")`. The `unread:update` handler already tells you when a room you're not viewing got a message — but careful: it also fires when the badge resets to 0. Only ring when `d.unread > 0`.

**How to verify**: two clients, DM one from the other, your terminal makes the bell sound.

### 6. Message length cap

**Goal**: reject messages longer than 500 characters with a clean error, client-side *and* server-side (server emits `error`).

**Files**: `client/src/components/InputBox.jsx`, `src/sockets/chatSocket.js`

**Hint**: server already validates empty text in `message:send`. Add a length check next to it. Client-side: the InputBox could show a system line or just refuse to send.

**How to verify**: paste a 600-char string — nothing is sent, an error appears. Also test with a raw socket (see Level 2 for the raw-socket pattern).

### 7. Username in the sidebar header

**Goal**: show your own username under the TermChat logo in the sidebar, dim, e.g. `as alice`.

**Files**: `client/src/components/Sidebar.jsx`, `client/src/components/ChatScreen.jsx`

**Hint**: Sidebar currently takes `items`, `currentRoom`, etc. — add a prop.

### 8. `/help <command>`

**Goal**: `/help dm` prints just that command's description; `/help` with no args prints everything (current behavior).

**Files**: `client/src/commands.js`, `client/src/components/ChatScreen.jsx`

**Hint**: `handleCommand` receives `(name, raw)` — the raw string still contains the argument.

### 9. Sent-message highlight

**Goal**: your own messages render with a slightly different style — e.g. bold username, or a dim `you` tag before the timestamp.

**Files**: `client/src/components/MessageFeed.jsx`, `client/src/components/ChatScreen.jsx`

**Hint**: entries store `username`; ChatScreen knows the logged-in user. MessageFeed needs to know who "you" is.

### 10. Typing indicator for DMs only

**Goal**: only show "X is typing..." in DMs, never in `#general` (currently it shows everywhere).

**Files**: `client/src/components/ChatScreen.jsx`

**Hint**: the typing set is populated in `onTypingUpdate`, which already knows the room. Or gate it at render time based on `currentRoom`.

---

## Level 2 — Intermediate (real features)

These touch the server, the DB, and the client together. Read the relevant flow sections in `ARCHITECTURE.md` first.

### 11. `/me` action messages

**Goal**: `/me waves` sends an action message rendered as `* alice waves *` (dim italic) — in the current room. Persist it so history shows it correctly.

**Files**: `src/models/Message.js`, `src/sockets/chatSocket.js`, `client/src/components/MessageFeed.jsx`, `client/src/components/ChatScreen.jsx`

**Hints**:
- Give messages a `kind` field: `"message"` default, `"action"` for `/me`.
- Server: handle `/me`-style payloads (client can send `kind: "action"`).
- Client: render actions as dim italic without the `name:` prefix.
- Verify history renders old `/me` messages correctly.

### 12. Delete a message

**Goal**: `/del <id-or-index>` deletes your own last message (or a specific one) — the message disappears for everyone, and history too.

**Files**: `src/sockets/chatSocket.js`, `src/models/Message.js`, `client/src/components/ChatScreen.jsx`, `client/src/components/MessageFeed.jsx`

**Hints**:
- Server: new event `message:delete { messageId, username }` — only the author may delete; verify the message belongs to that username (never trust the client).
- Broadcast `message:deleted { id }` to the room so everyone removes it from their feed.
- Client: track message `id`s in entries (currently they're not kept — you'll need to add them).
- **Gotcha**: two clients must both remove it; a reloaded client must not show it (it's gone from the DB).

### 13. Rate limiting / flood protection

**Goal**: a user can send at most 1 message per second, and messages are max 500 chars server-side (bonus: also cap typing:start spam).

**Files**: `src/sockets/chatSocket.js`

**Hints**:
- Keep `lastSendAt` per socket (a variable in `registerChatHandlers` scope, like `announced`).
- On `message:send`, if less than 1s has passed, emit `error: { message: "Slow down!" }` and drop.
- Don't reject every message from legit fast typists — 1s is a good default.

**How to verify**: two raw sockets (or one script) firing 10 sends instantly → only ~1-2 get through, rest get errors.

### 14. Load older messages

**Goal**: pressing `PageUp` (or `/back` command) loads 20 older messages and prepends them to the feed. Server needs a cursor-based API.

**Files**: `src/sockets/chatSocket.js`, `client/src/components/ChatScreen.jsx`, `client/src/components/MessageFeed.jsx`

**Hints**:
- Server: `message:history` currently sends last 20. Add `message:more { room, before }` where `before` is the `createdAt` of your oldest visible message → returns 20 messages older than that.
- `Message.find({ room, createdAt: { $lt: before } }).sort({ createdAt: -1 }).limit(20)`
- Client: prepend to `entries` (and remove the `MAX_VISIBLE` slice in MessageFeed so older ones survive, or bump it).

### 15. Channels you can create

**Goal**: `/create gaming` creates a new channel (server-side, in the DB), everyone sees it in their sidebar under CHANNELS.

**Files**: `src/models/` (new Channel model or reuse Message room ids), `src/sockets/chatSocket.js`, `client/src/commands.js`, `client/src/components/ChatScreen.jsx`, `client/src/components/Sidebar.jsx`

**Hints**:
- Server: new `channel:create { name }` event + a `Channel` collection (or a `channels` array on a meta doc). Validate the name, prevent duplicates.
- `user:join` should include channels in `buildRoomList`, and channel:create should push a `rooms:list` to everyone online.
- Client: `/create` command → emit → on `rooms:list` refresh.
- **Gotcha**: message:send must validate the room still exists (you can't DM yourself into a made-up room).

### 16. Search history

**Goal**: `/search <term>` searches all your accessible rooms and prints matching messages in the feed (dim, with room name).

**Files**: `src/sockets/chatSocket.js`, `client/src/commands.js`, `client/src/components/ChatScreen.jsx`

**Hint**: server-side search with a regex on `text`: `Message.find({ text: new RegExp(term, "i") }).limit(20)`. Think about whether to limit to rooms the user can join.

### 17. Remember the last room

**Goal**: the client reopens your last viewed room after a restart (not always `#general`).

**Files**: `client/src/session.js`, `client/src/components/ChatScreen.jsx`, `client/src/components/AuthScreen.jsx`

**Hints**: you already have a session file — add a `lastRoom` field. Write it on room switch, read it on ChatScreen mount, emit `user:join` for it instead of `general`.

### 18. Unread badge for #general

**Goal**: general-channel messages also show an unread badge when you're not viewing it.

**Files**: `src/sockets/chatSocket.js`

**Hint**: the unread logic already increments general for everyone — but `buildRoomList` only lists DM rooms (`room.startsWith("dm:")`). What happens if you drop that filter? Test that the badge doesn't show when you're the sender and doesn't leak to users who never joined.

### 19. Ping command

**Goal**: `/ping` measures your connection latency: send a `ping` event, server replies `pong` with `Date.now()`, client prints `42ms`.

**Files**: `src/sockets/chatSocket.js`, `client/src/commands.js`, `client/src/components/ChatScreen.jsx`

**Hint**: pure round-trip timing — no DB involved. This is also a nice way to debug a flaky connection.

### 20. Config file for the client

**Goal**: `~/.termchat/config.json` with `{ theme: "dark" }` or a color preference; the client reads it at startup and applies it.

**Files**: `client/src/session.js` (pattern), `client/src/utils/colorFromUsername.js`, `client/src/App.jsx`

**Hints**: mirror `readSession`/`writeSession`. Keep it simple: one setting that visibly changes something (e.g. the accent color in the sidebar title).

---

## Level 3 — Hard (real engineering)

These require thinking about state, edge cases, and multi-client consistency.

### 21. Edit a message

**Goal**: `/edit <text>` replaces your last message in the current room — everyone sees the edit (marked `(edited)`), history too.

**Files**: `src/sockets/chatSocket.js`, `src/models/Message.js`, `client/src/components/ChatScreen.jsx`, `client/src/components/MessageFeed.jsx`

**Hard parts**:
- Only the author can edit, and only the last message they sent (or accept a message id — your call).
- Everyone's feed must update in place; reloaded clients must see the edit.
- Handle the race: editing while someone deletes that message.
- **Gotcha**: message ids in the feed (Challenge 12) become mandatory now.

### 22. Idempotent sends (no duplicate messages on reconnect)

**Goal**: if the connection drops right after the server persists your message but before the echo arrives, reconnect must NOT send the message twice.

**Files**: `src/sockets/chatSocket.js`, `client/src/components/InputBox.jsx` or `ChatScreen.jsx`

**Hard parts**:
- Give every message a client-generated `id` (uuid). Server stores it and rejects (or dedupes) repeats.
- `Message` schema needs a unique index on `id`.
- Test: kill the server mid-send (hard to simulate — try sending exactly as you kill it), restart, verify one copy.
- This is how real chat apps do it. This one is the real deal.

### 23. Block a user

**Goal**: `/block <user>` — they can't DM you (their send fails), and their messages never appear in your feed. `/unblock`.

**Files**: `src/models/User.js`, `src/sockets/chatSocket.js`, `client/src/commands.js`

**Hard parts**:
- Blocks are directional and stored per user (`blocked: [usernames]` on your doc).
- Check on `message:send` — but *whose* block wins? (Hint: recipient's — sender shouldn't know they're blocked.)
- History must filter blocked users' messages *server-side*, not client-side.
- **Edge case**: blocked user is in #general — do their general messages vanish too? Decide and document your choice.

### 24. Multiple sessions per account

**Goal**: the same account can be logged in on two machines at once — both receive messages, both update unread, and logging in on a third doesn't kick the others (currently `token` is single and gets rotated).

**Files**: `src/models/User.js`, `src/sockets/chatSocket.js`

**Hard parts**:
- `token` is one field and `socketId` is one field — both need to become arrays (or a sessions subcollection).
- Unread reset: resetting on machine A shouldn't wipe unread shown on machine B. Real apps use per-session read state or last-read timestamps.
- Targeted `unread:update` must reach *all* of a user's sockets.
- Reconnect logic must re-auth correctly on both.
- This is a big refactor — plan it before coding.

### 25. End-to-end encryption for DMs

**Goal**: DM text is encrypted such that **the server can't read it** — only the two participants.

**Files**: `src/models/Message.js`, `src/sockets/chatSocket.js`, `client/src/session.js`, `client/src/components/AuthScreen.jsx`, `client/src/components/ChatScreen.jsx`

**Hard parts** (this is the real X25519 + ECDH flow):
- Each user gets a keypair at registration. Public keys are stored on the user doc (public = fine); private keys live **only** in the client's session file.
- To DM someone, you need their public key → exchange keys (server can relay them, since they're public).
- Shared secret: `ECDH(theirPub, yourPriv)` → a symmetric key for that DM room, cached client-side.
- Message bodies are `ciphertext` + `iv`; the server stores and relays them blindly.
- **Gotcha**: how do you handle a user who registered on machine A and opens on machine B? (Hint: their private key is on A — this is exactly why Signal does verification screens.) Decide and document the tradeoff.
- Node's `node:crypto` has everything you need: `crypto.generateKeyPairSync("x25519")`, `crypto.diffieHellman`, `crypto.createCipheriv("aes-256-gcm")`.

### 26. Self-hosted attachment sharing

**Goal**: `/upload <path>` sends a file to the room; others see it as `[file: name 2.3KB]` and can `/download <name>` to save it.

**Files**: everything

**Hard parts**:
- Files go over the wire as base64 chunks (socket.io handles big payloads but slowly) — chunk them.
- Store them: GridFS in MongoDB (built into mongoose) or the filesystem. Server enforces a size cap (e.g. 10MB).
- Message schema gets `attachment: { name, size, id }`.
- Download + save with backpressure (streams, don't load the whole file into memory).
- Two clients syncing the same file at once should both work.

### 27. Message threads

**Goal**: `/reply <id> <text>` creates a thread; pressing `T` on a message opens the thread view.

**Files**: `src/models/Message.js`, `src/sockets/chatSocket.js`, `client/src/components/MessageFeed.jsx`, `client/src/components/ChatScreen.jsx`

**Hard parts**:
- Threads are just messages with a `parentId`. The thread view is a *virtual room* — same data, different filter.
- History for a room and for a thread need different queries.
- Unread: does a reply to your thread count as unread in the room? Real apps say yes with a special indicator. You decide.

---

## Boss level (for when you've done the rest)

These are mini-projects. Pick one, spend days on it.

1. **Terminal UI over SSH / remote**: run the client from anywhere using `ssh user@box termchat` — makes sense now that DMs and channels exist. What breaks? (Hint: TTY detection, colors.)
2. **Web frontend**: a browser client for the same server (`client/web/` with Vite). Same events, different rendering. This teaches you exactly how transport-agnostic your API design is.
3. **Message DB migration**: switch `createdAt` sort to a monotonic sequence number (`seq` per room) so paging and edits never reorder. Then migrate existing data. (Real apps hit this.)
4. **Multi-server federation**: two TermChat servers, `dm:alice@serverA_bob@serverB`. This is a big one — research how Matrix did it.
5. **Security audit + hardening**: go through `chatSocket.js` line by line and write a checklist (auth on every handler? rate limits? can you spoof a username? can you join a room you shouldn't? what happens with 10k users?). Then fix everything you found.

---

## The point

The challenges are ordered so each one teaches you a pattern you'll reuse: state management (L1), server validation (L2), consistency across clients (L3), and distributed design (boss). When you finish one, `git commit` it, run your own verification, and tell me what you built — I'll review the code with you, and we'll note the good ideas in `ARCHITECTURE.md`.
