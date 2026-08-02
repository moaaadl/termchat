import crypto from "node:crypto";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Placeholder users (created when someone DMs an unregistered username)
    // have no passwordHash/salt yet; they are claimed on first registration.
    passwordHash: {
      type: String,
    },
    salt: {
      type: String,
    },
    socketId: {
      type: String,
    },
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "online",
    },
    unread: {
      type: Map,
      of: Number,
      default: {},
    },
    // Session token: set on login/register, cleared on logout or re-login.
    token: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

userSchema.methods.verifyPassword = function (password) {
  const hash = crypto.scryptSync(password, this.salt, 64);
  const stored = Buffer.from(this.passwordHash, "hex");
  return stored.length === hash.length && crypto.timingSafeEqual(hash, stored);
};

export const hashPassword = (password, salt) =>
  crypto.scryptSync(password, salt, 64).toString("hex");

export default mongoose.model("User", userSchema);
