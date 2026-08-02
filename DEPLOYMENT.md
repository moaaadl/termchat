# TermChat Deployment Guide

Step-by-step guide to deploy the TermChat backend on **Render** with **MongoDB Atlas**, then connect the CLI client from anywhere.

## Overview

| Component | Service | Purpose |
| --------- | ------- | ------- |
| Database  | MongoDB Atlas (M0 Free) | Persists users and messages |
| Backend   | Render (Free) | Serves HTTP + WebSocket on port 4000 |
| Client    | Local `termchat` CLI | Connects over the internet via `TERMCHAT_URL` |

The repo ships with `render.yaml`, so deployment is a few clicks.

---

## Part 1 — MongoDB Atlas (Free Cluster)

1. Go to <https://atlas.mongodb.com> and sign up / log in.
2. Click **Build a Database** → choose the **M0 Free** tier (Shared) → pick a cloud provider and region (any) → **Create Deployment**.
3. **Database Access** (left sidebar):
   - Add New Database User.
   - Username + password — store them somewhere safe; you'll put the password in the connection string.
   - Role: **Read and write to any database** (default is fine).
4. **Network Access**:
   - Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`) so Render and your laptop can both reach it.
5. **Get the connection string**:
   - Database → Connect → *Drivers* (or *MongoDB for VS Code*).
   - Copy the `mongodb+srv://...` URI. The default looks like:
     ```
     mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
     ```
   - **Append the database name** `termchat` before the query string:
     ```
     mongodb+srv://<user>:<password>@<cluster>.mongodb.net/termchat?retryWrites=true&w=majority
     ```
   - Replace `<user>` and `<password>` with the Database Access credentials from step 3.

---

## Part 2 — Render (Free Backend)

1. Go to <https://render.com> and **Sign Up with GitHub**.
2. Make sure the `termchat` repo is public (or connect Render to your GitHub account).
3. Click **New** → **Blueprint**.
4. Pick the `termchat` repo. Render reads `render.yaml` and proposes a **Web Service** automatically.
5. Set the required environment variable:
   - `MONGODB_URI` → paste the connection string from Part 1.
6. Click **Apply** and wait for the first deploy (build + start, a minute or two).
7. Once live, find your app URL, e.g. `https://termchat.onrender.com`.

### Verify the deployment

```bash
curl https://termchat.onrender.com/health
# -> {"status":"ok"}
```

`render.yaml` sets `MONGODB_URI` as `sync: false`, meaning you must paste it during the Blueprint flow (it is not stored in the repo). The free tier supports WebSockets, which Socket.IO needs.

### Redeploy after code changes

- Auto-deploys on every push to `main` (default from the Blueprint), or
- Dashboard → your service → **Manual Deploy** → **Deploy latest commit**.

---

## Part 3 — Connect the CLI Client

The client defaults to `http://localhost:4000`. Point it at the deployed server either with the `--server` flag or the `TERMCHAT_URL` environment variable:

```bash
# via the global command
termchat --server https://termchat.onrender.com

# or via env var
TERMCHAT_URL=https://termchat.onrender.com npm start
```

### Sessions survive redeploys

Login tokens live in MongoDB (in the `users` collection), not on the server process — so redeploying or restarting Render doesn't log anyone out. The client stores the token locally in `~/.termchat/session.json`; it re-authenticates on launch with `auth:token`. `/logout` invalidates the token server-side.

One active session per account: logging in on a new machine rotates the token, which revokes the previous machine's session (it'll show "Session expired — log in again" on next action).

---

## Resetting data

`npm run freshdb` (run in the repo root) drops the **entire** database — users, messages, unread counts. It refuses to run against anything that isn't a `localhost` URI unless you pass `-- --yes` (so you can't accidentally wipe the Atlas database from a local checkout).

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Client shows "Waiting for the server..." forever | Server not reachable — check the Render URL ends in `/`-less form and the service is `Live` in the dashboard. |
| Server fails to start on Render | Look at the service **Logs** tab; the most common cause is a malformed `MONGODB_URI` (wrong password, or missing `/termchat` db name). |
| `MongooseServerSelectionError` | Atlas network access doesn't include `0.0.0.0/0`, or the DB user doesn't have access to the cluster. |
| Connection drops every few seconds | The server's heartbeat is `pingInterval: 5000, pingTimeout: 3000` — firewalls/proxies that delay frames longer than 3s kill the socket. On Render free tier this should not happen; if it does, check you are hitting the deployed server and not `localhost`. |

---

## Local-first development flow

Run everything locally with zero cloud cost:

```bash
# terminal 1
mongostart

# terminal 2 (repo root)
npm run dev

# terminal 3 (client dir)
npm start
```
