import crypto from "node:crypto";
import User, { hashPassword } from "../models/User.js";
import Message from "../models/Message.js";

// Usernames: 2-24 chars, letters/digits/underscore only.
const USERNAME_RE = /^[a-zA-Z0-9_]{2,24}$/;

// Canonical room id for a DM between two users (sorted so both share it).
export const dmRoom = (a, b) => `dm:${[a, b].sort().join("_")}`;

export const registerChatHandlers = (io, socket) => {
  // Socket ids that have authenticated via auth:login / auth:register.
  // Only those may join the chat.
  const authedSockets = new Set();
  // Whether this socket already announced its arrival (only once per session).
  const announced = { current: false };

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

  // A room is joinable if it's "general" or a DM that involves this user.
  const canJoin = (room, username) => {
    if (room === "general") {
      return true;
    }
    if (room.startsWith("dm:")) {
      const participants = room.slice(3).split("_");
      return participants.includes(username);
    }
    return false;
  };

  // ---- user:join ----
  // Join a room: mark online, join the socket room, reset unread, send
  // history + room list.
  socket.on("user:join", async (data) => {
    try {
      if (!authedSockets.has(socket.id)) {
        socket.emit("error", { message: "Login or register first" });
        return;
      }
      const username = (data?.username || "").trim();
      const room = (data?.room || "general").trim();
      if (!username || !canJoin(room, username)) {
        socket.emit("error", { message: "You cannot join that room" });
        return;
      }

      socket.join(room);

      // Upsert the user so they stay registered across reconnects.
      await User.findOneAndUpdate(
        { username },
        { socketId: socket.id, status: "online" },
        { upsert: true, new: true }
      );

      // Reset unread for this room and let the client know.
      await User.findOneAndUpdate(
        { username },
        { $set: { [`unread.${room}`]: 0 } }
      );
      socket.emit("unread:update", { room, unread: 0 });

      // Send the 20 most recent messages of the room (oldest first).
      const messages = await Message.find({ room })
        .sort({ createdAt: -1 })
        .limit(20);
      socket.emit(
        "message:history",
        messages.reverse().map((m) => ({
          username: m.username,
          text: m.text,
          room: m.room,
          timestamp: m.createdAt,
        }))
      );

      // Full room list with unread counts, so the sidebar is always in sync.
      socket.emit("rooms:list", await buildRoomList(io, username));

      // Tell everyone else that this user just came online (once per session).
      if (!announced.current) {
        announced.current = true;
        socket.broadcast.emit("user:joined", { username });
        await broadcastPresence(io);
      }
    } catch (error) {
      console.error(`user:join error: ${error.message}`);
      socket.emit("error", { message: "Failed to join" });
    }
  });

  // ---- user:leave ----
  socket.on("user:leave", (data) => {
    const room = (data?.room || "").trim();
    if (room) {
      socket.leave(room);
    }
  });

  // ---- message:send ----
  // Persist the message, bump unread counters, push to the room.
  socket.on("message:send", async (data) => {
    try {
      const username = (data?.username || "").trim();
      const text = (data?.text || "").trim();
      const room = (data?.room || "general").trim();
      if (!username || !text) {
        socket.emit("error", { message: "Username and text are required" });
        return;
      }
      if (!canJoin(room, username)) {
        socket.emit("error", { message: "You cannot send to that room" });
        return;
      }

      const message = await Message.create({ username, text, room });

      // Emit to everyone in the room, including the sender.
      io.to(room).emit("message:new", {
        username: message.username,
        text: message.text,
        room: message.room,
        timestamp: message.createdAt,
      });

      // Increment unread for the other DM participant (or everyone, in
      // general), and notify online users who are not viewing this room.
      let affectedUsernames;
      if (room.startsWith("dm:")) {
        affectedUsernames = room.slice(3).split("_").filter((u) => u !== username);
      } else {
        affectedUsernames = await User.find({ username: { $ne: username } })
          .select("username -_id")
          .then((us) => us.map((u) => u.username));
      }
      if (affectedUsernames.length > 0) {
        await User.updateMany(
          { username: { $in: affectedUsernames } },
          { $inc: { [`unread.${room}`]: 1 } }
        );
      }
      const others = await User.find({ username: { $in: affectedUsernames } }).select(
        "username socketId unread"
      );
      for (const user of others) {
        if (!user.socketId) {
          continue;
        }
        const targetSocket = io.sockets.sockets.get(user.socketId);
        if (targetSocket && !targetSocket.rooms.has(room)) {
          targetSocket.emit("unread:update", {
            room,
            unread: user.unread.get(room) ?? 0,
          });
        }
      }
    } catch (error) {
      console.error(`message:send error: ${error.message}`);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // ---- typing:start / typing:stop ----
  // Relay typing indicators to everyone in the room except the typist.
  const handleTyping = (isTyping) => {
    return (data) => {
      try {
        const username = (data?.username || "").trim();
        const room = (data?.room || "general").trim();
        if (!username) {
          socket.emit("error", { message: "Username is required" });
          return;
        }
        socket.to(room).emit("typing:update", { username, room, isTyping });
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

// Build the sidebar room list for a user: #general plus every DM they have
// unread messages in.
async function buildRoomList(io, username) {
  const user = await User.findOne({ username }).select("unread");
  const unread = user?.unread ?? {};
  const rooms = [
    { id: "general", type: "channel", name: "general", unread: unread.get?.("general") ?? 0 },
  ];
  for (const [room, count] of unread.entries?.() ?? []) {
    if (room !== "general" && count > 0 && room.startsWith("dm:")) {
      const peer = room.slice(3).split("_").find((u) => u !== username);
      rooms.push({ id: room, type: "dm", name: peer, unread: count });
    }
  }
  return { rooms };
}
