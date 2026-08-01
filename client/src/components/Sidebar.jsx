import React from "react";
import { Box, Text, useInput } from "ink";

const Item = ({ item, open, hovered }) => (
  <Box>
    <Text>
      {hovered ? "▸ " : "  "}
      {item.type === "channel" ? (
        <Text bold color={open ? "cyanBright" : "white"}>
          # {item.name}
        </Text>
      ) : (
        <Text color={open ? "cyanBright" : "white"}>
          {open ? "@ " : "  "}
          {item.name}
        </Text>
      )}
      {item.unread > 0 && (
        <Text color="yellow" bold>
          {"  "}({item.unread})
        </Text>
      )}
    </Text>
  </Box>
);

const Sidebar = ({
  items,
  currentRoom,
  selectedIndex,
  onNavigate,
  onOpen,
  active,
  onFocusInput,
}) => {
  useInput(
    (_input, key) => {
      if (key.upArrow) {
        onNavigate(-1);
      } else if (key.downArrow) {
        onNavigate(1);
      } else if (key.return && items[selectedIndex]) {
        onOpen(items[selectedIndex].id);
        onFocusInput();
      } else if (key.tab || key.escape) {
        onFocusInput();
      }
    },
    { isActive: active }
  );

  return (
    <Box flexDirection="column" width={26} paddingRight={1} marginRight={1}>
      <Text bold color="cyanBright">
        TermChat
      </Text>
      <Text dimColor marginTop={1}>
        CHANNELS
      </Text>
      {items
        .filter((i) => i.type === "channel")
        .map((item) => (
          <Item
            key={item.id}
            item={item}
            open={item.id === currentRoom}
            hovered={items[selectedIndex]?.id === item.id && active}
          />
        ))}
      <Text dimColor marginTop={1}>
        DIRECT MESSAGES
      </Text>
      {items
        .filter((i) => i.type !== "channel")
        .map((item) => (
          <Item
            key={item.id}
            item={item}
            open={item.id === currentRoom}
            hovered={items[selectedIndex]?.id === item.id && active}
          />
        ))}
      <Box marginTop={1}>
        <Text dimColor italic>
          Tab: switch · ↑↓: navigate
        </Text>
      </Box>
    </Box>
  );
};

export default Sidebar;
