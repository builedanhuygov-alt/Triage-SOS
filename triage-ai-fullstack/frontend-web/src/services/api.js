import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const api = axios.create({ baseURL: API_URL, timeout: 8000 });

// Gắn JWT demo cho mọi request (login 1 chạm qua RoleSwitcher)
export function setToken(token) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}
try {
  const s = JSON.parse(localStorage.getItem("triage-auth") || "null");
  if (s?.token) setToken(s.token);
} catch {}

// Cũ (giữ nguyên contract cho dashboard hiện tại)
export const fetchDashboard = () => api.get("/api/dashboard").then((r) => r.data);
export const postEmergency = (payload) => api.post("/api/emergency", payload).then((r) => r.data);
// Bác sĩ xử lý y lệnh: { action, notes, disposition, hospital, reason }
export const updateEmergency = (id, payload) =>
  api.put(`/api/emergency/${encodeURIComponent(id)}`, payload).then((r) => r.data);

// Mới (envelope {success,data}): bóc .data.data
const unwrap = (p) => p.then((r) => r.data.data);
export const apiLogin = (email, password) => api.post("/api/auth/login", { email, password }).then((r) => r.data.data);
export const apiMe = () => unwrap(api.get("/api/auth/me"));
export const fetchFlagged = () => unwrap(api.get("/api/moderation/flagged"));
export const reviewFlagged = (id, decision, note) =>
  unwrap(api.post(`/api/moderation/${encodeURIComponent(id)}/review`, { decision, note }));
export const postPatientStatus = (patientId, payload) =>
  unwrap(api.post(`/api/patients/${encodeURIComponent(patientId)}/status`, payload));
export const fetchMeta = () => unwrap(api.get("/api/meta"));
export const fetchAudit = (limit = 50) => unwrap(api.get(`/api/audit?limit=${limit}`));
export const fetchNotifications = () => api.get("/api/notifications").then((r) => r.data.data);
export const markNotifRead = (id) => unwrap(api.post(`/api/notifications/${id}/read`));
export const markAllNotifRead = () => unwrap(api.post("/api/notifications/read-all"));
export const aiAsk = (question) => unwrap(api.post("/api/ai/ask", { question }));
export const searchAll = (q) => unwrap(api.get(`/api/search?q=${encodeURIComponent(q)}`));
