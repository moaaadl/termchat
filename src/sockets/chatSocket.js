import crypto from "node:crypto";
import User, { hashPassword } from "../models/User.js";
import Message from "../models/Message.js";

// Usernames: 2-24 chars, letters/digits/underscore only.
const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

export const registerChatHandlers = (io, socket) => {
  // Socket ids that have authenticated via auth:login / auth:register.
  // Only those may join the chat.
  const authedSockets = new Set();

  // ---- auth:register ----
  socket.on("auth:register", async (data) => {
    try {
      const username = (data?.username || "").trim();
      const password = data?.password || "";
      if (!USERNAME_RE.test(username)) {
        socket.emit("auth:error", {
          message: "Username must be 2-24 characters (letters, numbers, _)",
        });
        return;
      }
      if (password.length < 4) {
        socket.emit("auth:error", {
          message: "Password must be at least 4 characters",
        });
        return;
      }
      if (await User.exists({ username })) {
        socket.emit("auth:error", { message: "That username is already taken" });
        return;
      }
      const salt = crypto.randomBytes(16).toString("hex");
      await User.create({
        username,
        passwordHash: hashPassword(password, salt),
        salt,
        socketId: socket.id,
      });
      authedSockets.add(socket.id);
      socket.emit("auth:success", { username });
    } catch (error) {
      console.error(`auth:register error: ${error.message}`);
      socket.emit("auth:error", { message: "Failed to register" });
    }
  });

  // ---- auth:login ----
  socket.on("auth:login", async (data) => {
    try {
      const username = (data?.username || "").trim();
      const password = data?.password || "";
      const user = await User.findOne({ username });
      if (!user || !user.verifyPassword(password)) {
        socket.emit("auth:error", { message: "Invalid username or password" });
        return;
      }
      authedSockets.add(socket.id);
      socket.emit("auth:success", { username: user.username });
    } catch (error) {
      console.error(`auth:login error: ${error.message}`);
      socket.emit("auth:error", { message: "Failed to login" });
    }
  });

  // ---- user:join ----
  // Register the user, mark them online, send message history, notify others.
  socket.on("user:join", async (data) => {
    try {
      if (!authedSockets.has(socket.id)) {
        socket.emit("error", { message: "Login or register first" });
        return;
      }
      const username = (data?.username || "").trim();
      if (!username) {
        socket.emit("error", { message: "Username is required" });
        return;
      }

      // Upsert the user so they stay registered across reconnects.
      await User.findOneAndUpdate(
        { username },
        { socketId: socket.id, status: "online" },
        { upsert: true, new: true }
      );

      // Broadcast the new online count to everyone (including the joiner).
      await broadcastPresence(io);

      // Send the 20 most recent messages (oldest first) to the joining client.
      const messages = await Message.find().sort({ createdAt: -1 }).limit(20);
      socket.emit(
        "message:history",
        messages.reverse().map((m) => ({
          username: m.username,
          text: m.text,
          room: m.room,
          timestamp: m.createdAt,
        }))
      );

      // Tell everyone else that this user just came online.
      socket.broadcast.emit("user:joined", { username });
    } catch (error) {
      console.error(`user:join error: ${error.message}`);
      socket.emit("error", { message: "Failed to join" });
    }
  });

  // ---- message:send ----
  // Persist the message, then push it to every connected client.
  socket.on("message:send", async (data) => {
    try {
      const username = (data?.username || "").trim();
      const text = (data?.text || "").trim();
      if (!username || !text) {
        socket.emit("error", { message: "Username and text are required" });
        return;
      }

      const message = await Message.create({ username, text, room: "general" });

      // Emit to ALL clients, including the sender.
      io.emit("message:new", {
        username: message.username,
        text: message.text,
        timestamp: message.createdAt,
      });
    } catch (error) {
      console.error(`message:send error: ${error.message}`);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // ---- typing:start / typing:stop ----
  // Relay typing indicators to everyone except the typist.
  const handleTyping = (isTyping) => {
    return (data) => {
      try {
        const username = (data?.username || "").trim();
        if (!username) {
          socket.emit("error", { message: "Username is required" });
          return;
        }
        socket.broadcast.emit("typing:update", { username, isTyping });
      } catch (error) {
        console.error(`typing error: ${error.message}`);
        socket.emit("error", { message: "Failed to update typing status" });
      }
    };
  };

  socket.on("typing:start", handleTyping(true));
  socket.on("typing:stop", handleTyping(false));

  // ---- users:list ----
  // Send the requesting client the list of currently online usernames.
  socket.on("users:list", async () => {
    try {
      const users = await User.find({ status: "online" }).select("username -_id");
      socket.emit("users:list", { usernames: users.map((u) => u.username) });
    } catch (error) {
      console.error(`users:list error: ${error.message}`);
      socket.emit("error", { message: "Failed to list users" });
    }
  });

  // ---- disconnect ----
  // Mark the user offline and notify the remaining clients.
  socket.on("disconnect", async () => {
    try {
      const user = await User.findOneAndUpdate(
        { socketId: socket.id },
        { status: "offline" },
        { new: true }
      );
      if (user) {
        socket.broadcast.emit("user:left", { username: user.username });
      }
      await broadcastPresence(io);
    } catch (error) {
      console.error(`disconnect error: ${error.message}`);
    }
  });
};

// Broadcast the current count of online users to all connected clients.
async function broadcastPresence(io) {
  const online = await User.countDocuments({ status: "online" });
  io.emit("presence:update", { online });
}
