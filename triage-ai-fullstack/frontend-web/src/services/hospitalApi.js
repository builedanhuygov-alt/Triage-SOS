import { api } from "./api.js";

// Client cho module DEMO1 (Tòa -> Khoa -> User -> Role -> Permission -> Scope).
const unwrap = (p) => p.then((r) => r.data.data);

export const fetchOrgSummary = () => unwrap(api.get("/api/org/summary"));
export const fetchOrgTree = () => unwrap(api.get("/api/org/tree"));
export const fetchDepartments = () => unwrap(api.get("/api/org/departments"));
export const fetchStaff = (params = {}) => unwrap(api.get("/api/staff", { params }));
export const fetchDoctors = (params = {}) => unwrap(api.get("/api/staff/doctors", { params }));
export const fetchStaffDetail = (username) =>
  unwrap(api.get(`/api/staff/${encodeURIComponent(username)}`));
export const updateStaffStatus = (username, status) =>
  unwrap(api.patch(`/api/staff/${encodeURIComponent(username)}`, { status }));
export const resetStaffPassword = (username) =>
  unwrap(api.post(`/api/staff/${encodeURIComponent(username)}/reset-password`));
export const fetchRoles = () => unwrap(api.get("/api/rbac/roles"));
export const fetchPermissions = () => unwrap(api.get("/api/rbac/permissions"));
export const fetchMatrix = () => unwrap(api.get("/api/rbac/matrix"));
export const checkPermission = (params) => unwrap(api.get("/api/rbac/check", { params }));
export const fetchDemoAccounts = (group) =>
  unwrap(api.get("/api/demo/accounts", { params: group ? { group } : {} }));
export const loginDemo = (username, password) =>
  api.post("/api/auth/login", { username, password }).then((r) => r.data.data);

// V2: clinical + ops (intake/encounter/journey/bhyt/bill/resource/doc/capacity/anomaly/sos/meds/health)
export const intakePatient = (body) => unwrap(api.post("/api/patients/intake", body));
export const fetchRegistry = (q) => unwrap(api.get("/api/patients/registry", { params: q ? { q } : {} }));
export const fetchChart = (pid) => unwrap(api.get(`/api/patients/${encodeURIComponent(pid)}/chart`));
export const fetchEncounters = (params = {}) => unwrap(api.get("/api/encounters", { params }));
export const createEncounter = (body) => unwrap(api.post("/api/encounters", body));
export const patchEncounter = (id, body) => unwrap(api.patch(`/api/encounters/${encodeURIComponent(id)}`, body));
export const fetchJourney = (id) => unwrap(api.get(`/api/encounters/${encodeURIComponent(id)}/journey`));
export const addNote = (id, body) => unwrap(api.post(`/api/encounters/${encodeURIComponent(id)}/notes`, body));
export const confirmNote = (noteId) => unwrap(api.post(`/api/notes/${encodeURIComponent(noteId)}/confirm`));
export const addDiagnosis = (id, body) => unwrap(api.post(`/api/encounters/${encodeURIComponent(id)}/diagnosis`, body));
export const createOrder = (id, body) => unwrap(api.post(`/api/encounters/${encodeURIComponent(id)}/orders`, body));
export const verifyResult = (orderId, summary) => unwrap(api.post(`/api/care-orders/${encodeURIComponent(orderId)}/result`, { summary }));
export const releaseResult = (resId) => unwrap(api.post(`/api/results/${encodeURIComponent(resId)}/release`));
export const createRx = (id, items) => unwrap(api.post(`/api/encounters/${encodeURIComponent(id)}/prescriptions`, { items }));
export const approveRx = (id) => unwrap(api.post(`/api/prescriptions/${encodeURIComponent(id)}/approve`));
export const dispenseRx = (id) => unwrap(api.post(`/api/prescriptions/${encodeURIComponent(id)}/dispense`));
export const createFollowup = (id, body) => unwrap(api.post(`/api/encounters/${encodeURIComponent(id)}/followups`, body));
export const bhytVerify = (body) => unwrap(api.post("/api/bhyt/verify", body));
export const bhytManual = (body) => unwrap(api.post("/api/bhyt/manual", body));
export const createBill = (id, items) => unwrap(api.post(`/api/encounters/${encodeURIComponent(id)}/bills`, { items }));
export const confirmPayment = (id, body) => unwrap(api.post(`/api/payments/${encodeURIComponent(id)}/confirm`, body));
export const fetchDocuments = (params = {}) => unwrap(api.get("/api/documents", { params }));
export const createDocument = (body) => unwrap(api.post("/api/documents", body));
export const receiveDocument = (id) => unwrap(api.post(`/api/documents/${encodeURIComponent(id)}/receive`));
export const processDocument = (id, note) => unwrap(api.patch(`/api/documents/${encodeURIComponent(id)}/process`, { note }));
export const approveDocument = (id) => unwrap(api.post(`/api/documents/${encodeURIComponent(id)}/approve`));
export const fetchCapacity = () => unwrap(api.get("/api/capacity"));
export const patchCapacity = (dept, body) => unwrap(api.patch(`/api/capacity/${encodeURIComponent(dept)}`, body));
export const fetchResources = (params = {}) => unwrap(api.get("/api/resources", { params }));
export const createResource = (body) => unwrap(api.post("/api/resources", body));
export const fetchResourceAlerts = () => unwrap(api.get("/api/resource-alerts"));
export const requestResource = (id, body) => unwrap(api.post(`/api/resources/${encodeURIComponent(id)}/request`, body));
export const processApproval = (id) => unwrap(api.post(`/api/approvals/${encodeURIComponent(id)}/process`));
export const approveApproval = (id, decision, note) => unwrap(api.post(`/api/approvals/${encodeURIComponent(id)}/approve`, { decision, note }));
export const fetchApprovals = (state) => unwrap(api.get("/api/approvals", { params: state ? { state } : {} }));
export const fetchAnomaly = (state) => unwrap(api.get("/api/anomaly/cases", { params: state ? { state } : {} }));
export const reviewAnomaly = (id, decision, note) => unwrap(api.post(`/api/anomaly/cases/${encodeURIComponent(id)}/review`, { decision, note }));
export const fetchSos = (status) => unwrap(api.get("/api/sos", { params: status ? { status } : {} }));
export const patchSos = (id, status) => unwrap(api.patch(`/api/sos/${encodeURIComponent(id)}`, { status }));
export const fetchOverview = (params = {}) => unwrap(api.get("/api/command/overview", { params }));
export const fetchWhoami = () => unwrap(api.get("/api/rbac/whoami"));
export const fetchAppVersion = () => unwrap(api.get("/api/app/version"));

// User Management (§5-8): admin tao → INVITED → accept → ACTIVE (hash, khong plaintext)
export const adminListUsers = (params = {}) => unwrap(api.get("/api/admin/users", { params }));
export const adminCreateUser = (body) => unwrap(api.post("/api/admin/users", body));
export const adminAcceptInvite = (token, password) => unwrap(api.post("/api/admin/users/accept", { token, password }));
export const adminGetUser = (username) => unwrap(api.get(`/api/admin/users/${encodeURIComponent(username)}`));
export const adminUpdateUser = (username, body) => unwrap(api.patch(`/api/admin/users/${encodeURIComponent(username)}`, body));
export const adminSetStatus = (username, status, reason) => unwrap(api.post(`/api/admin/users/${encodeURIComponent(username)}/status`, { status, reason }));
export const adminResetPassword = (username) => unwrap(api.post(`/api/admin/users/${encodeURIComponent(username)}/reset-password`));
export const adminUserAudit = (username) => unwrap(api.get(`/api/admin/users/${encodeURIComponent(username)}/audit`));
export const adminSummary = () => unwrap(api.get("/api/admin/summary"));

export const API_BASE = api.defaults.baseURL;
