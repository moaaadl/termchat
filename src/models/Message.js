import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    room: {
      type: String,
      default: "general",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

export default mongoose.model("Message", messageSchema);
