import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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

export default mongoose.model("User", userSchema);
