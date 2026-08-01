export const COMMANDS = [
  { name: "/help", description: "Show available commands" },
  { name: "/users", description: "Show who is online" },
  { name: "/q", description: "Quit TermChat" },
];

export const matchCommands = (prefix) =>
  COMMANDS.filter((c) =>
    c.name.toLowerCase().startsWith(prefix.toLowerCase())
  );
