import { io } from "socket.io-client";

export const socket = io("/", {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10
});