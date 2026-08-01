#!/usr/bin/env node
import { register } from "node:module";

register("../jsx-loader.mjs", import.meta.url);

// termchat [--server <url>]
const serverIndex = process.argv.indexOf("--server");
if (serverIndex !== -1 && process.argv[serverIndex + 1]) {
  process.env.TERMCHAT_URL = process.argv[serverIndex + 1];
}

await import("../index.js");
