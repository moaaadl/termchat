export const COMMANDS = [
  { name: "/help", description: "Show available commands" },
  { name: "/dm", description: "Open a private chat: /dm <username>" },
  { name: "/logout", description: "Log out and forget this session" },
  { name: "/q", description: "Quit TermChat" },
  { name: "/clear", description: "Clean Chat" },
];

export const matchCommands = (prefix) =>
  COMMANDS.filter((c) => c.name.toLowerCase().startsWith(prefix.toLowerCase()));
