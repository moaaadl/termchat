export const COMMANDS = [
  { name: "/help", description: "Show available commands" },
  { name: "/dm", description: "Open a private chat: /dm <username>" },
  { name: "/q", description: "Quit TermChat" },
];

export const matchCommands = (prefix) =>
  COMMANDS.filter((c) =>
    c.name.toLowerCase().startsWith(prefix.toLowerCase())
  );
