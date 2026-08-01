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
    passwordHash: {
      type: String,
      required: true,
    },
    salt: {
      type: String,
      required: true,
    },
    socketId: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "online",
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
