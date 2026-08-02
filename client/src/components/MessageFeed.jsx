import React from "react";
import { Box, Text } from "ink";
import { colorFromUsername } from "../utils/colorFromUsername.js";

const MAX_VISIBLE = 20;

const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const MessageFeed = ({ entries }) => (
  <Box flexDirection="column" flexGrow={1} overflow="hidden">
    {entries.slice(-MAX_VISIBLE).map((entry) =>
      entry.kind === "system" ? (
        <Text key={entry.id} dimColor italic>
          {entry.text}
        </Text>
      ) : (
        <Text key={entry.id}>
          <Text dimColor>{formatTime(entry.timestamp)} </Text>
          <Text color={colorFromUsername(entry.username)}>{entry.username}</Text>
          <Text> {entry.text}</Text>
        </Text>
      )
    )}
  </Box>
);

export default MessageFeed;
