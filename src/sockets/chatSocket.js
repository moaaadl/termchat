import User from "../models/User.js";
import Message from "../models/Message.js";

export const registerChatHandlers = (io, socket) => {
  // ---- user:join ----
  // Register the user, mark them online, send message history, notify others.
  socket.on("user:join", async (data) => {
    try {
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
    } catch (error) {
      console.error(`disconnect error: ${error.message}`);
    }
  });
};
