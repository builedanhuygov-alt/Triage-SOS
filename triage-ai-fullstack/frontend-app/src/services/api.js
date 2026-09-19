import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({ baseURL: API_URL, timeout: 8000 });

export function setToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}
try {
  const s = JSON.parse(localStorage.getItem("triage-session") || "null");
  if (s?.token) setToken(s.token);
} catch {}

/** Gửi tín hiệu cấp cứu -> POST /api/emergency (backend broadcast socket). */
export const sendEmergencySignal = (payload) => api.post("/api/emergency", payload).then((r) => r.data);

// Auth + đồng bộ patient
const unwrap = (p) => p.then((r) => r.data.data);
export const apiLogin = (email, password) => api.post("/api/auth/login", { email, password }).then((r) => r.data.data);
export const fetchMyAppointments = () => unwrap(api.get("/api/me/appointments"));
export const fetchMyMeds = () => unwrap(api.get("/api/me/medications"));
export const fetchMyRecord = () => unwrap(api.get("/api/me/medical-record"));
export const fetchMyNotifications = () => unwrap(api.get("/api/me/notifications"));
