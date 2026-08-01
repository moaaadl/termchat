import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import { socket } from "./socket.js";
import Login from "./components/Login.jsx";
import ChatScreen from "./components/ChatScreen.jsx";

const App = () => {
  const { exit } = useApp();
  const [username, setUsername] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  const handleQuit = () => {
    socket.close();
    exit();
  };

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color="cyanBright" bold>
        TermChat
      </Text>
      {!username && !connected && (
        <Text color="yellow">Connecting to server at localhost:4000...</Text>
      )}
      {username ? (
        <ChatScreen username={username} onQuit={handleQuit} />
      ) : (
        <Login onLogin={setUsername} />
      )}
    </Box>
  );
};

export default App;
