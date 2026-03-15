import { io } from "socket.io-client";
export const socket = io(import.meta.env.VITE_API_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});