import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text } from "ink";
import { socket } from "../socket.js";
import { COMMANDS } from "../commands.js";
import Sidebar from "./Sidebar.jsx";
import StatusBar from "./StatusBar.jsx";
import MessageFeed from "./MessageFeed.jsx";
import TypingIndicator from "./TypingIndicator.jsx";
import InputBox from "./InputBox.jsx";

export const dmRoomId = (a, b) => `dm:${[a, b].sort().join("_")}`;
export const peerOf = (room, username) =>
  room === "general"
    ? "general"
    : room.slice(3).split("_").find((u) => u !== username) ?? room;

const ChatScreen = ({ username, password, onQuit }) => {
  const [rooms, setRooms] = useState([
    { id: "general", type: "channel", name: "general", unread: 0 },
  ]);
  const [currentRoom, setCurrentRoom] = useState("general");
  const [entries, setEntries] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [online, setOnline] = useState(0);
  const [disconnected, setDisconnected] = useState(!socket.connected);
  const [sidebarFocused, setSidebarFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const idRef = useRef(0);
  const authedRef = useRef(true);
  const currentRoomRef = useRef("general");
  currentRoomRef.current = currentRoom;

  const nextId = () => ++idRef.current;

  const pushSystem = (text, kind = "system") =>
    setEntries((prev) => [...prev, { id: nextId(), kind, text }]);

  const handleCommand = (name, raw = "") => {
    if (name === "/help") {
      const lines = [
        "Available commands:",
        ...COMMANDS.map((c) => `  ${c.name}  ${c.description}`),
      ];
      pushSystem(lines.join("\n"));
    } else if (name === "/users") {
      pushSystem("Fetching online users...", "fetching");
      socket.emit("users:list");
    } else if (name === "/q") {
      onQuit();
    } else if (name === "unknown") {
      pushSystem(`Unknown command: ${raw}. Type /help for available commands.`);
    }
  };

  const switchRoom = (room) => {
    if (room === currentRoomRef.current) {
      return;
    }
    socket.emit("user:leave", { username, room: currentRoomRef.current });
    setCurrentRoom(room);
    setEntries([]);
    setTypingUsers(new Set());
    socket.emit("user:join", { username, room });
    setRooms((prev) =>
      prev.some((r) => r.id === room)
        ? prev
        : [
            ...prev,
            {
              id: room,
              type: room === "general" ? "channel" : "dm",
              name: peerOf(room, username),
              unread: 0,
            },
          ]
    );
  };

  useEffect(() => {
    const onHistory = (messages) => {
      if (messages[0]?.room && messages[0].room !== currentRoomRef.current) {
        return;
      }
      setEntries(
        messages.map((m) => ({
          id: nextId(),
          kind: "message",
          username: m.username,
          text: m.text,
          timestamp: m.timestamp,
        }))
      );
    };
    const onNewMessage = (m) => {
      if (m.room !== currentRoomRef.current) {
        return;
      }
      setEntries((prev) => [
        ...prev,
        {
          id: nextId(),
          kind: "message",
          username: m.username,
          text: m.text,
          timestamp: m.timestamp,
        },
      ]);
    };
    const onUserJoined = (d) => {
      setOnlineUsers((prev) => (prev.includes(d.username) ? prev : [...prev, d.username]));
      if (currentRoomRef.current === "general") {
        pushSystem(`* ${d.username} joined the chat *`);
      }
    };
    const onUserLeft = (d) => {
      setOnlineUsers((prev) => prev.filter((u) => u !== d.username));
      setTypingUsers((prev) => {
        const next = new Set(prev);
        next.delete(d.username);
        return next;
      });
      if (currentRoomRef.current === "general") {
        pushSystem(`* ${d.username} left the chat *`);
      }
    };
    const onTypingUpdate = (d) => {
      if (d.room !== currentRoomRef.current) {
        return;
      }
      setTypingUsers((prev) => {
        const next = new Set(prev);
        if (d.isTyping) {
          next.add(d.username);
        } else {
          next.delete(d.username);
        }
        return next;
      });
    };
    const onPresence = (d) => setOnline(d.online);
    const onRoomsList = (d) => setRooms(d.rooms);
    const onUnreadUpdate = (d) =>
      setRooms((prev) => {
        const existing = prev.find((r) => r.id === d.room);
        if (existing) {
          return prev.map((r) =>
            r.id === d.room ? { ...r, unread: d.unread } : r
          );
        }
        if (d.unread <= 0) {
          return prev;
        }
        return [
          ...prev,
          {
            id: d.room,
            type: d.room === "general" ? "channel" : "dm",
            name: peerOf(d.room, username),
            unread: d.unread,
          },
        ];
      });
    const onUsersList = (d) => {
      setOnlineUsers(d.usernames.filter((u) => u !== username));
      setEntries((prev) => {
        if (!prev.some((e) => e.kind === "fetching")) {
          return prev;
        }
        return [
          ...prev.filter((e) => e.kind !== "fetching"),
          {
            id: nextId(),
            kind: "system",
            text:
              d.usernames.length === 0
                ? "No one else is online right now."
                : `Online: ${d.usernames.join(", ")}`,
          },
        ];
      });
    };
    const onConnect = () => {
      setDisconnected(false);
      if (authedRef.current) {
        socket.emit("user:join", { username, room: currentRoomRef.current });
      } else {
        socket.emit("auth:login", { username, password });
      }
    };
    const onAuthSuccess = () => {
      authedRef.current = true;
      socket.emit("user:join", { username, room: currentRoomRef.current });
    };
    const onAuthError = (d) => {
      authedRef.current = false;
      pushSystem(`Re-login failed: ${d.message}`);
    };
    const onDisconnect = () => {
      setDisconnected(true);
      authedRef.current = false;
    };

    socket.on("message:history", onHistory);
    socket.on("message:new", onNewMessage);
    socket.on("user:joined", onUserJoined);
    socket.on("user:left", onUserLeft);
    socket.on("typing:update", onTypingUpdate);
    socket.on("presence:update", onPresence);
    socket.on("rooms:list", onRoomsList);
    socket.on("unread:update", onUnreadUpdate);
    socket.on("users:list", onUsersList);
    socket.on("connect", onConnect);
    socket.on("auth:success", onAuthSuccess);
    socket.on("auth:error", onAuthError);
    socket.on("disconnect", onDisconnect);

    // Join after listeners are attached so the history reply is never missed.
    socket.emit("user:join", { username, room: "general" });
    socket.emit("users:list");

    return () => {
      socket.off("message:history", onHistory);
      socket.off("message:new", onNewMessage);
      socket.off("user:joined", onUserJoined);
      socket.off("user:left", onUserLeft);
      socket.off("typing:update", onTypingUpdate);
      socket.off("presence:update", onPresence);
      socket.off("rooms:list", onRoomsList);
      socket.off("unread:update", onUnreadUpdate);
      socket.off("users:list", onUsersList);
      socket.off("connect", onConnect);
      socket.off("auth:success", onAuthSuccess);
      socket.off("auth:error", onAuthError);
      socket.off("disconnect", onDisconnect);
    };
  }, [username, password]);

  const items = useMemo(() => {
    const list = [];
    for (const r of rooms) {
      list.push({ id: r.id, type: r.type, name: r.name, unread: r.unread });
    }
    for (const u of onlineUsers) {
      const id = dmRoomId(username, u);
      if (!list.some((i) => i.id === id)) {
        list.push({ id, type: "dm", name: u, unread: 0 });
      }
    }
    return list;
  }, [rooms, onlineUsers, username]);

  const clampedSelected = Math.min(selectedIndex, Math.max(items.length - 1, 0));

  const handleSend = (text) =>
    socket.emit("message:send", {
      username,
      text,
      room: currentRoomRef.current,
    });

  const roomName =
    currentRoom === "general" ? "# general" : `@ ${peerOf(currentRoom, username)}`;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar
          items={items}
          currentRoom={currentRoom}
          selectedIndex={clampedSelected}
          onNavigate={(delta) =>
            setSelectedIndex((i) =>
              Math.max(0, Math.min(i + delta, items.length - 1))
            )
          }
          onOpen={(id) => switchRoom(id)}
          active={sidebarFocused}
          onFocusInput={() => setSidebarFocused(false)}
        />
        <Box flexDirection="column" flexGrow={1}>
          <StatusBar
            connected={!disconnected}
            online={online}
            roomName={roomName}
          />
          <MessageFeed entries={entries} />
          <TypingIndicator users={[...typingUsers]} />
          {disconnected && (
            <Text color="yellow">
              Disconnected from server... waiting for reconnect
            </Text>
          )}
          <InputBox
            active={!sidebarFocused}
            onFocusToggle={() => setSidebarFocused(true)}
            placeholder={
              currentRoom === "general"
                ? "Message #general"
                : `Message @${peerOf(currentRoom, username)}`
            }
            onSend={handleSend}
            onTypingStart={() =>
              socket.emit("typing:start", {
                username,
                room: currentRoomRef.current,
              })
            }
            onTypingStop={() =>
              socket.emit("typing:stop", {
                username,
                room: currentRoomRef.current,
              })
            }
            onQuit={onQuit}
            onCommand={handleCommand}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default ChatScreen;
