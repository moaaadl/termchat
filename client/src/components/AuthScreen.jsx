import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { socket } from "../socket.js";
import { readSession, writeSession, clearSession } from "../session.js";

const AuthScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [focus, setFocus] = useState("username");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If we have a saved session, skip the form and resume it.
    const saved = readSession();
    if (saved) {
      setBusy(true);
      socket.emit("auth:token", {
        username: saved.username,
        token: saved.token,
      });
    }

    const onSuccess = (d) => {
      writeSession({ username: d.username, token: d.token });
      onLogin({ username: d.username, password, token: d.token });
    };
    const onError = (d) => {
      clearSession();
      setError(d.message);
      setBusy(false);
    };
    socket.on("auth:success", onSuccess);
    socket.on("auth:error", onError);
    return () => {
      socket.off("auth:success", onSuccess);
      socket.off("auth:error", onError);
    };
  }, [password, onLogin]);

  const submit = (name = username.trim(), pass = password) => {
    if (!name || !pass) {
      setError("Enter your username and password");
      return;
    }
    setError(null);
    setBusy(true);
    socket.emit(mode === "login" ? "auth:login" : "auth:register", {
      username: name,
      password: pass,
    });
  };

  // A fast-typed or pasted Enter arrives inside the value (ink paste support).
  // Treat it as a real Enter: act on the text before it, keep the remainder.
  const handleUsernameChange = (next) => {
    if (/[\r\n]/.test(next)) {
      const index = next.search(/[\r\n]/);
      setUsername(next.slice(0, index));
      setFocus("password");
      return;
    }
    setUsername(next);
  };

  const handlePasswordChange = (next) => {
    if (/[\r\n]/.test(next)) {
      const index = next.search(/[\r\n]/);
      submit(username.trim(), next.slice(0, index));
      setPassword(next.slice(index + 1));
      return;
    }
    setPassword(next);
  };

  // Tab toggles between login and register (ink-text-input ignores Tab).
  useInput((_input, key) => {
    if (key.tab) {
      setMode((m) => (m === "login" ? "register" : "login"));
      setError(null);
      setFocus("username");
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" marginTop={2}>
      <Text bold color="cyanBright">
        TermChat
      </Text>
      <Text dimColor>
        {mode === "login" ? "Welcome back — login to continue" : "Create your account"}
      </Text>
      <Box flexDirection="column" width={34} marginTop={1}>
        <Text dimColor>username</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <TextInput
            value={username}
            onChange={handleUsernameChange}
            onSubmit={() => setFocus("password")}
            focus={focus === "username"}
            placeholder="e.g. moaad"
          />
        </Box>
        <Text dimColor marginTop={1}>
          password
        </Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <TextInput
            value={password}
            onChange={handlePasswordChange}
            onSubmit={() => submit()}
            focus={focus === "password"}
            mask="•"
            placeholder="••••••••"
          />
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text bold color="cyanBright">
          {mode === "login" ? "Login" : "Register"}
        </Text>
        <Text dimColor>
          {"   "}Tab to {mode === "login" ? "register" : "login"}
        </Text>
      </Box>
      {error && (
        <Text color="red" marginTop={1}>
          {error}
        </Text>
      )}
      {busy && (
        <Text dimColor marginTop={1}>
          ...
        </Text>
      )}
      {!socket.connected && (
        <Text color="yellow" marginTop={1}>
          Connecting to server...
        </Text>
      )}
    </Box>
  );
};

export default AuthScreen;
