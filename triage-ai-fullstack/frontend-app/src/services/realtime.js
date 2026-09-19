import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || "http://localhost:5000";

/** Socket mobile: join room caseId của mình để nhận GPS + trạng thái. */
export const socket = io(URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
});

export const joinCase = (caseId) => {
  if (caseId) {
    socket.emit("JOIN", `patient:${caseId}`);
    socket.emit("JOIN", `emergency:${caseId}`);
  }
};

export default socket;
