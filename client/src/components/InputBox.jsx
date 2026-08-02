import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { COMMANDS, matchCommands } from "../commands.js";

const TYPING_DEBOUNCE_MS = 1500;

const InputBox = ({
  onSend,
  onTypingStart,
  onTypingStop,
  onQuit,
  onCommand,
  active = true,
  onFocusToggle,
  placeholder = "Message #general",
}) => {
  const [value, setValue] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const typingRef = useRef(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const popupOpen = value.startsWith("/");
  const filtered = popupOpen ? matchCommands(value) : [];
  const selected = Math.min(selectedIndex, Math.max(filtered.length - 1, 0));

  // Keyboard navigation for the command palette. TextInput ignores
  // up/down/tab, so there is no conflict. Tab switches focus to the sidebar
  // when the palette is closed.
  useInput((input, key) => {
    if (!active) {
      return;
    }
    if (key.tab && !popupOpen) {
      onFocusToggle?.();
      return;
    }
    if (!popupOpen) {
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (key.downArrow) {
      setSelectedIndex((i) => (i + 1) % filtered.length);
    } else if (key.tab && filtered.length > 0) {
      setValue(filtered[selected].name);
    } else if (key.escape) {
      setValue("");
    } else if (input) {
      setSelectedIndex(0);
    }
  });

  const stopTyping = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (typingRef.current) {
      typingRef.current = false;
      onTypingStop();
    }
  };

  const handleChange = (next) => {
    // Ink keeps \r inside text chunks (paste support), so a fast-typed Enter
    // arrives as part of the value. Treat it as Enter: submit the text before
    // it and keep typing the remainder.
    if (/[\r\n]/.test(next)) {
      const index = next.search(/[\r\n]/);
      handleSubmit(next.slice(0, index));
      setValue(next.slice(index + 1));
      return;
    }
    setValue(next);
    setSelectedIndex(0);
    if (!next.trim()) {
      stopTyping();
      return;
    }
    if (!typingRef.current) {
      typingRef.current = true;
      onTypingStart();
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(stopTyping, TYPING_DEBOUNCE_MS);
  };

  const handleSubmit = (text) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      const match = COMMANDS.find(
        (c) =>
          trimmed.toLowerCase() === c.name.toLowerCase() ||
          trimmed.toLowerCase().startsWith(c.name.toLowerCase() + " ")
      );
      if (match) {
        onCommand(match.name, trimmed);
        setValue("");
        return;
      }
      onCommand("unknown", trimmed);
      setValue("");
      return;
    }
    stopTyping();
    setValue("");
    if (trimmed) {
      onSend(trimmed);
    }
  };

  return (
    <Box flexDirection="column">
      {popupOpen && filtered.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {filtered.map((command, i) => (
            <Text key={command.name}>
              {i === selected ? (
                <Text color="cyanBright" bold>
                  {"▸ "}
                  {command.name}
                </Text>
              ) : (
                <Text dimColor>
                  {"  "}
                  {command.name}
                </Text>
              )}
              {"  "}
              <Text dimColor>{command.description}</Text>
            </Text>
          ))}
        </Box>
      )}
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <TextInput
          value={value}
          onChange={handleChange}
          onSubmit={handleSubmit}
          placeholder={placeholder}
          focus={active}
        />
      </Box>
    </Box>
  );
};

export default InputBox;
