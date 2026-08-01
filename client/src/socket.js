import { io } from "socket.io-client";

// Point at your deployed backend with TERMCHAT_URL, e.g.:
// TERMCHAT_URL=https://termchat.onrender.com npm start
export const serverUrl = process.env.TERMCHAT_URL || "http://localhost:4000";

export const socket = io(serverUrl);

export default socket;
