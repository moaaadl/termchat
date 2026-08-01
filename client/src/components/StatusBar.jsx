import React from "react";
import { Box, Text, useStdout } from "ink";

const StatusBar = ({ connected, online, roomName }) => {
  const { stdout } = useStdout();
  const width = stdout.columns || 80;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text color={connected ? "green" : "red"}>● </Text>
          <Text bold>{roomName}</Text>
        </Box>
        <Text dimColor>{online} online</Text>
      </Box>
      <Text color="gray">{"─".repeat(width - 2)}</Text>
    </Box>
  );
};

export default StatusBar;
