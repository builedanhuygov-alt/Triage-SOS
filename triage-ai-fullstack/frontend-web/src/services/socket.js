import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

/** Socket singleton cho toàn app. Auto-reconnect cho demo pitch. */
export const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

// Gắn JWT sau login để server check RBAC thật trên socket (reconnect 1 lần)
try {
  const s = JSON.parse(localStorage.getItem("triage-auth") || "null");
  if (s?.token) socket.auth = { token: s.token };
} catch {}

export function authenticateSocket(token) {
  socket.auth = token ? { token } : {};
  if (socket.connected) socket.disconnect().connect();
  else socket.connect();
}

export default socket;
