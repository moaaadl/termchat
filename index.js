import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { Server } from "socket.io";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { registerChatHandlers } from "./src/sockets/chatSocket.js";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*" },
  // Tight heartbeat so clients notice dead connections in ~8s instead of ~45s.
  pingInterval: 5000,
  pingTimeout: 3000,
});

io.on("connection", (socket) => {
  registerChatHandlers(io, socket);
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`TermChat server running on port ${PORT}`);
  });
});
