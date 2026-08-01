import React, { useEffect, useState } from "react";
import { Box, useApp } from "ink";
import { socket } from "./socket.js";
import AuthScreen from "./components/AuthScreen.jsx";
import ChatScreen from "./components/ChatScreen.jsx";

const App = () => {
  const { exit } = useApp();
  const [credentials, setCredentials] = useState(null);

  const handleQuit = () => {
    socket.close();
    exit();
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {credentials ? (
        <ChatScreen
          username={credentials.username}
          password={credentials.password}
          onQuit={handleQuit}
        />
      ) : (
        <AuthScreen onLogin={setCredentials} />
      )}
    </Box>
  );
};

export default App;
