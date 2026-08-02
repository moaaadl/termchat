import React, { useState } from "react";
import { Box, useApp } from "ink";
import { socket } from "./socket.js";
import { clearSession } from "./session.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ChatScreen from "./components/ChatScreen.jsx";

const App = () => {
  const { exit } = useApp();
  const [credentials, setCredentials] = useState(null);

  const handleQuit = () => {
    socket.close();
    exit();
  };

  const handleLogout = () => {
    socket.emit("auth:logout", {
      username: credentials.username,
      token: credentials.token,
    });
    clearSession();
    setCredentials(null);
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {credentials ? (
        <ChatScreen
          username={credentials.username}
          password={credentials.password}
          onQuit={handleQuit}
          onLogout={handleLogout}
        />
      ) : (
        <AuthScreen onLogin={setCredentials} />
      )}
    </Box>
  );
};

export default App;
