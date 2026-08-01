import React from "react";
import { Box, Text } from "ink";
import { colorFromUsername } from "../utils/colorFromUsername.js";

const MAX_VISIBLE = 20;

const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const MessageRow = ({ entry, own }) => {
  if (entry.kind === "system" || entry.kind === "fetching") {
    return (
      <Text dimColor italic>
        {entry.text}
      </Text>
    );
  }
  const name = own ? "you" : entry.username;
  const color = own ? "cyanBright" : colorFromUsername(entry.username);
  return (
    <Box justifyContent={own ? "flex-end" : "flex-start"}>
      <Box>
        <Text dimColor>{formatTime(entry.timestamp)} </Text>
        <Text bold color={color}>
          {name}
        </Text>
        <Text> {entry.text}</Text>
      </Box>
    </Box>
  );
};

const MessageFeed = ({ entries, ownUsername }) => (
  <Box flexDirection="column" flexGrow={1} overflow="hidden">
    {entries.slice(-MAX_VISIBLE).map((entry) => (
      <MessageRow key={entry.id} entry={entry} own={entry.username === ownUsername} />
    ))}
  </Box>
);

export default MessageFeed;
