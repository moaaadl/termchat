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
    <Box flexDirection="column">
      <Text dimColor>Welcome to TermChat. Choose a username:</Text>
      <TextInput
        value={username}
        onChange={setUsername}
        onSubmit={handleSubmit}
        placeholder="username"
        focus
      />
      {!socket.connected && (
        <Text color="yellow">Waiting for the server at localhost:4000...</Text>
      )}
    </Box>
  );
};

export default Login;
