import { io } from "socket.io-client";

export const socket = io("/", {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});