const PALETTE = ["cyan", "magenta", "yellow", "green", "blue", "red"];

export const colorFromUsername = (username) => {
  let hash = 0;
  for (const char of username) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
};
