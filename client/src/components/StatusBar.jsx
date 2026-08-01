import React from "react";
import { Box, Text, useStdout } from "ink";

const StatusBar = ({ connected, online }) => {
  const { stdout } = useStdout();
  const width = stdout.columns || 80;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text color={connected ? "green" : "red"}>● </Text>
          <Text bold color="cyanBright">
            TermChat
          </Text>
        </Box>
        <Text dimColor>
          {online} {online === 1 ? "user" : "users"} online
        </Text>
      </Box>
      <Text color="gray">
        {connected ? "─".repeat(width - 2) : "┄".repeat(width - 2)}
      </Text>
    </Box>
  );
};

export default StatusBar;
