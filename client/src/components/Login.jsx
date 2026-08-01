import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { socket } from "../socket.js";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");

  const handleSubmit = (value) => {
    const name = value.trim();
    if (name) {
      onLogin(name);
    }
  };

  return (
    <Box flexDirection="column" alignItems="center">
      <Box flexDirection="column" alignItems="center" marginTop={2} marginBottom={1}>
        <Text bold color="cyanBright">
          ● TermChat
        </Text>
        <Text dimColor>Welcome — pick a username to join #general</Text>
      </Box>
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <TextInput
          value={username}
          onChange={setUsername}
          onSubmit={handleSubmit}
          placeholder="username"
          focus
        />
      </Box>
      {!socket.connected && (
        <Text color="yellow" marginTop={1}>
          Waiting for the server...
        </Text>
      )}
    </Box>
  );
};

export default Login;
