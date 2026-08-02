import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

dotenv.config({
  path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"),
});

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/termchat";
const force =
  process.argv.includes("--yes") || process.env.FRESHDB_FORCE === "1";

if (
  !force &&
  !uri.startsWith("mongodb://localhost") &&
  !uri.startsWith("mongodb://127.0.0.1")
) {
  console.error(`Refusing to wipe non-local database: ${uri}`);
  console.error("Re-run with --yes to force.");
  process.exit(1);
}

await mongoose.connect(uri);
await mongoose.connection.dropDatabase();
console.log(`Database wiped: ${uri}`);
await mongoose.disconnect();
