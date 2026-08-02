import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SESSION_DIR = path.join(os.homedir(), ".termchat");
const SESSION_FILE = path.join(SESSION_DIR, "session.json");

export const readSession = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    if (parsed?.username && parsed?.token) {
      return parsed;
    }
  } catch {
    // No session yet or corrupted file — treat as logged out.
  }
  return null;
};

export const writeSession = ({ username, token }) => {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ username, token }), {
      mode: 0o600,
    });
  } catch (error) {
    console.error(`Failed to save session: ${error.message}`);
  }
};

export const clearSession = () => {
  try {
    fs.rmSync(SESSION_FILE, { force: true });
  } catch (error) {
    console.error(`Failed to clear session: ${error.message}`);
  }
};
