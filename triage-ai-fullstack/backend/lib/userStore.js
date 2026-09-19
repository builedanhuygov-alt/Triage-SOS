/**
 * lib/userStore — Persistent user management storage (SQLite via node:sqlite, zero new deps).
 *
 * Conceptual model (§22): 250 seed accounts = INITIAL SEED (seed=1).
 * Admin-created users (seed=0) persist across restart/redeploy/server sleep
 * trong file DATABASE_URL (default backend/data/hospital.db).
 * KHONG bao gio hard-delete user (DISABLED/DISABLE la trang thai cuoi, khong co API xoa).
 *
 * Password: scrypt hash (salt:hash hex). Khong plaintext, khong tra hash qua API.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = process.env.DATABASE_PATH || process.env.DATABASE_URL || path.join(__dirname, "..", "data", "hospital.db");

let db = null;
let memMode = false;
const mem = new Map(); // fallback khi sqlite khong kha dung

function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), Buffer.from(salt, "hex"), 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(":");
    const calc = crypto.scryptSync(String(password), Buffer.from(salt, "hex"), 64);
    return crypto.timingSafeEqual(calc, Buffer.from(hash, "hex"));
  } catch { return false; }
}

function open() {
  if (db || memMode) return db;
  try {
    const { DatabaseSync } = require("node:sqlite");
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    try { db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;"); } catch {}
    db.exec(`
      CREATE TABLE IF NOT EXISTS users(
        id TEXT PRIMARY KEY, employee_id TEXT UNIQUE, username TEXT UNIQUE, email TEXT UNIQUE,
        phone TEXT, full_name TEXT, job_title TEXT, role TEXT, department TEXT, department_name TEXT,
        unit TEXT, building TEXT, floor TEXT, room TEXT, scope_json TEXT, supervisor TEXT,
        status TEXT, password_hash TEXT, invite_token TEXT,
        legacy_role TEXT, legacy_dept TEXT, specialty TEXT,
        seed INTEGER DEFAULT 0, created_by TEXT, created_at TEXT, updated_at TEXT, last_login TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_dept ON users(department);
      CREATE TABLE IF NOT EXISTS idem_keys(
        key TEXT PRIMARY KEY, status INTEGER, body_json TEXT, created_at TEXT
      );
    `);
  } catch (e) {
    console.warn("[userstore] sqlite unavailable, using memory (NOT persistent):", e.message);
    memMode = true;
  }
  return db;
}

function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id, userId: r.id.replace("u-demo-", "DEMO-U-").replace("u-local-", "LOCAL-U-"),
    employeeId: r.employee_id, username: r.username, email: r.email, phone: r.phone,
    fullName: r.full_name, jobTitle: r.job_title, role: r.role,
    department: r.department, departmentName: r.department_name, unit: r.unit,
    building: r.building, floor: r.floor, room: r.room || "",
    scope: r.scope_json ? JSON.parse(r.scope_json) : null,
    supervisor: r.supervisor, status: r.status,
    legacyRole: r.legacy_role || null, legacyDept: r.legacy_dept || null,
    specialty: r.specialty || null, position: r.job_title,
    seed: !!r.seed, createdBy: r.created_by, createdAt: r.created_at,
    updatedAt: r.updated_at, lastLogin: r.last_login,
    isDemo: !!r.seed,
  };
}
function safeUser(u) {
  if (!u) return null;
  const { password_hash, invite_token, ...rest } = u;
  return rest;
}

function toRow(u, passwordHash) {
  return {
    id: u.id, employee_id: u.employeeId, username: u.username, email: u.email, phone: u.phone || "",
    full_name: u.fullName, job_title: u.jobTitle, role: u.role,
    department: u.department || null, department_name: u.departmentName || "",
    unit: u.unit || null, building: u.building || "", floor: String(u.floor ?? ""),
    room: u.room || "", scope_json: JSON.stringify(u.scope || {}), supervisor: u.supervisor || "",
    status: u.status || "ACTIVE", password_hash: passwordHash,
    invite_token: null, legacy_role: u.legacyRole || null, legacy_dept: u.legacyDept || null,
    specialty: u.specialty || null, seed: 1, created_by: "seed", created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), last_login: null,
  };
}

/** Import seed 1 lần (INSERT OR IGNORE). Hash demo password 1 lần duy nhất (nhanh).
 * §9: CHỈ seed khi database trống — không overwrite production data, không duplicate. */
function importSeed(seedUsers, demoPassword) {
  open();
  if (count() > 0) return { added: 0, total: count(), skipped: "non-empty" };
  const seedHash = hashPassword(demoPassword, "dec0seed000000000000000000000001");
  let added = 0;
  if (memMode) {
    for (const u of seedUsers) {
      if ([...mem.values()].some((r) => r.username === u.username)) continue;
      const r = toRow(u, seedHash);
      mem.set(r.id, r); added++;
    }
    return { added, total: mem.size };
  }
  const cols = Object.keys(toRow(seedUsers[0], seedHash));
  const stmt = db.prepare(`INSERT OR IGNORE INTO users(${cols.join(",")}) VALUES(${cols.map((c) => "@" + c).join(",")})`);
  db.exec("BEGIN");
  try {
    for (const u of seedUsers) { const ch = stmt.run(toRow(u, seedHash)); added += ch.changes; }
    db.exec("COMMIT");
  } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
  return { added, total: db.prepare("SELECT COUNT(*) c FROM users").get().c };
}

function findRaw(where, val) {
  open();
  if (memMode) {
    for (const r of mem.values()) {
      if (where === "username" && r.username === String(val).toLowerCase()) return r;
      if (where === "email" && r.email === String(val).toLowerCase()) return r;
      if (where === "id" && r.id === val) return r;
      if (where === "invite_token" && r.invite_token === val) return r;
    }
    return null;
  }
  const col = { username: "username", email: "email", id: "id", invite_token: "invite_token" }[where];
  const v = (where === "username" || where === "email") ? String(val).toLowerCase() : val;
  return db.prepare(`SELECT * FROM users WHERE ${col} = ?`).get(v) || null;
}
const findByUsername = (u) => rowToUser(findRaw("username", u));
const findByEmail = (e) => rowToUser(findRaw("email", e));
const findById = (id) => rowToUser(findRaw("id", id));
const findByEmailOrUsername = (v) => findByUsername(v) || findByEmail(v);

function insertRow(r) {
  if (memMode) { mem.set(r.id, r); return r; }
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO users(${cols.join(",")}) VALUES(${cols.map((c) => "@" + c).join(",")})`).run(r);
  return r;
}
function updateRow(id, patch) {
  const now = new Date().toISOString();
  if (memMode) {
    const r = mem.get(id);
    if (!r) return null;
    Object.assign(r, patch, { updated_at: now });
    return r;
  }
  const keys = Object.keys(patch);
  db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = @${k}`).join(", ")}, updated_at = @now WHERE id = @id`).run({ ...patch, now, id });
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function list({ q, role, department, building, status } = {}) {
  open();
  let rows;
  if (memMode) rows = [...mem.values()];
  else rows = db.prepare("SELECT * FROM users ORDER BY created_at").all();
  const nq = String(q || "").toLowerCase();
  return rows.map(rowToUser).filter((u) => {
    if (nq && ![u.fullName, u.username, u.employeeId, u.email].some((s) => String(s || "").toLowerCase().includes(nq))) return false;
    if (role && u.role !== role) return false;
    if (department && u.department !== department) return false;
    if (building && u.building !== building) return false;
    if (status && u.status !== status) return false;
    return true;
  });
}
function count() {
  open();
  if (memMode) return mem.size;
  return db.prepare("SELECT COUNT(*) c FROM users").get().c;
}
/* Idempotency persistent (§33): key -> {status, body} TTL 24h. Restart không mất. */
const idemMem = new Map();
function idemGet(key) {
  open();
  if (memMode) return idemMem.get(key) || null;
  try {
    const r = db.prepare("SELECT status, body_json FROM idem_keys WHERE key = ?").get(key);
    if (!r) return null;
    return { status: r.status, body: JSON.parse(r.body_json) };
  } catch { return null; }
}
function idemSet(key, status, body) {
  open();
  if (memMode) {
    idemMem.set(key, { status, body });
    if (idemMem.size > 500) idemMem.delete(idemMem.keys().next().value);
    return;
  }
  try {
    db.prepare("INSERT OR REPLACE INTO idem_keys(key, status, body_json, created_at) VALUES(?,?,?,?)")
      .run(key, status, JSON.stringify(body), new Date().toISOString());
    db.prepare("DELETE FROM idem_keys WHERE created_at < ?").run(new Date(Date.now() - 864e5).toISOString());
  } catch {}
}
function dbPath() { return memMode ? "memory (NOT persistent)" : DB_PATH; }

module.exports = { open, hashPassword, verifyPassword, importSeed, findByUsername, findByEmail,
  findById, findByEmailOrUsername, findRaw, insertRow, updateRow, list, count, rowToUser, safeUser, dbPath,
  idemGet, idemSet };
