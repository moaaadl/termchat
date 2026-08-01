# TermChat

A real-time terminal chat application backend built with Node.js, Express, Socket.IO, and MongoDB. It provides a WebSocket-based API for CLI chat clients: join a chat, exchange messages in real time, see typing indicators, and track user presence (online/offline).

## Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Runtime  | Node.js (ES Modules) |
| HTTP     | Express |
| Realtime | Socket.IO |
| Database | MongoDB (Mongoose ODM) |
| Config   | dotenv |
| Dev      | Nodemon |

## Prerequisites

- **Node.js** >= 18 (ESM support)
- **MongoDB** running locally on `mongodb://localhost:27017` (or your own instance)
- On macOS with the `mongod` binary at `/usr/local/mongodb/bin/mongod`, these aliases are convenient (add to `~/.zshrc`):

```zsh
alias mongostart='nohup /usr/local/mongodb/bin/mongod --dbpath /usr/local/var/mongodb-data --port 27017 --bind_ip 127.0.0.1 > /tmp/mongod.log 2>&1 &'
alias mongostop='pkill mongod'
```

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start MongoDB (if not already running)
mongostart

# 4. Start the server (development mode with auto-reload)
npm run dev
```

The server listens on `http://localhost:4000` by default. Verify it's up:

```bash
curl http://localhost:4000/health
# -> {"status":"ok"}
```

| Script | Description |
| ------ | ----------- |
| `npm start` | Run the server in production mode |
| `npm run dev` | Run the server with Nodemon (auto-restart on change) |

## Environment Variables

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `4000` | HTTP + WebSocket port |
| `MONGODB_URI` | `mongodb://localhost:27017/termchat` | MongoDB connection string |

## Project Structure

```
termchat/
├── index.js                 # Entry point: HTTP + Socket.IO server
├── src/
│   ├── app.js               # Express app, middleware, HTTP routes
│   ├── config/
│   │   └── db.js            # Mongoose connection
│   ├── models/
│   │   ├── User.js          # User schema (username, socketId, status)
│   │   └── Message.js       # Message schema (username, text, room)
│   ├── routes/
│   │   └── health.js        # GET /health
│   └── sockets/
│       └── chatSocket.js    # Socket.IO chat handlers
```

## Socket.IO Event API

Connect to the server at `http://localhost:4000` (e.g. `socket.io-client` in a CLI client). All string fields are trimmed and empty values are rejected — the server emits an `error` event with `{ message }` on invalid input.

### Client -> Server

| Event | Payload | Description |
| ----- | ------- | ----------- |
| `user:join` | `{ username: string }` | Register/upsert the user (marked `online`), attach their socket, receive message history. |
| `message:send` | `{ username: string, text: string }` | Persist a message (room defaults to `"general"`) and broadcast it to all clients. |
| `typing:start` | `{ username: string }` | Notify others that the user started typing. |
| `typing:stop` | `{ username: string }` | Notify others that the user stopped typing. |

### Server -> Client

| Event | Payload | Emitted when |
| ----- | ------- | ------------ |
| `message:history` | `{ username: string, text: string, room: string, timestamp: Date }[]` (last 20, oldest first) | A client emits `user:join` — sent to that client only. |
| `user:joined` | `{ username: string }` | A user joins — broadcast to all other connected clients. |
| `message:new` | `{ username: string, text: string, timestamp: Date }` | A message is sent — broadcast to **all** clients including the sender. |
| `typing:update` | `{ username: string, isTyping: boolean }` | A client emits `typing:start`/`typing:stop` — broadcast to all other clients. |
| `user:left` | `{ username: string }` | A user disconnects — broadcast to remaining clients. |
| `error` | `{ message: string }` | Invalid input or a handler failure — sent to the offending client. |

## Example Client Flow

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:4000");

socket.emit("user:join", { username: "alice" });

socket.on("message:history", (messages) => {
  messages.forEach((m) => console.log(`${m.username}: ${m.text}`));
});

socket.on("message:new", (m) => console.log(`${m.username}: ${m.text}`));

// send a message
socket.emit("message:send", { username: "alice", text: "hello everyone" });
```
