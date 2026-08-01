import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "ink";
import { socket } from "../socket.js";
import { COMMANDS } from "../commands.js";
import MessageFeed from "./MessageFeed.jsx";
import TypingIndicator from "./TypingIndicator.jsx";
import InputBox from "./InputBox.jsx";

const ChatScreen = ({ username, onQuit }) => {
  const [entries, setEntries] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [disconnected, setDisconnected] = useState(!socket.connected);
  const idRef = useRef(0);

  const nextId = () => ++idRef.current;

  const pushSystem = (text) =>
    setEntries((prev) => [...prev, { id: nextId(), kind: "system", text }]);

  const handleCommand = (name, raw = "") => {
    if (name === "/help") {
      const lines = [
        "Available commands:",
        ...COMMANDS.map((c) => `  ${c.name}  ${c.description}`),
      ];
      pushSystem(lines.join("\n"));
    } else if (name === "/q") {
      onQuit();
    } else if (name === "unknown") {
      pushSystem(`Unknown command: ${raw}. Type /help for available commands.`);
    }
  };

  useEffect(() => {
    const onHistory = (messages) =>
      setEntries(
        messages.map((m) => ({
          id: nextId(),
          kind: "message",
          username: m.username,
          text: m.text,
        }))
      );
    const onNewMessage = (m) =>
      setEntries((prev) => [
        ...prev,
        { id: nextId(), kind: "message", username: m.username, text: m.text },
      ]);
    const onUserJoined = (d) => pushSystem(`* ${d.username} joined the chat *`);
    const onUserLeft = (d) => {
      pushSystem(`* ${d.username} left the chat *`);
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(d.username);
        return next;
      });
    };
    const onTypingUpdate = (d) =>
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (d.isTyping) {
          next.add(d.username);
        } else {
          next.delete(d.username);
        }
        return next;
      });
    const onConnect = () => {
      setDisconnected(false);
      socket.emit("user:join", { username });
    };
    const onDisconnect = () => setDisconnected(true);

    socket.on("message:history", onHistory);
    socket.on("message:new", onNewMessage);
    socket.on("user:joined", onUserJoined);
    socket.on("user:left", onUserLeft);
    socket.on("typing:update", onTypingUpdate);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Join after listeners are attached so the history reply is never missed.
    socket.emit("user:join", { username });

    return () => {
      socket.off("message:history", onHistory);
      socket.off("message:new", onNewMessage);
      socket.off("user:joined", onUserJoined);
      socket.off("user:left", onUserLeft);
      socket.off("typing:update", onTypingUpdate);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [username]);

  const handleSend = (text) => socket.emit("message:send", { username, text });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <MessageFeed entries={entries} />
      <TypingIndicator users={[...typingUsers]} />
      {disconnected && (
        <Text color="yellow">Disconnected from server... waiting for reconnect</Text>
      )}
      <InputBox
        onSend={handleSend}
        onTypingStart={() => socket.emit("typing:start", { username })}
        onTypingStop={() => socket.emit("typing:stop", { username })}
        onQuit={onQuit}
        onCommand={handleCommand}
      />
    </Box>
  );
};

export default ChatScreen;
