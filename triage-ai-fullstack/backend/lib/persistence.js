/**
 * lib/persistence — snapshot JSON ghi đè in-memory store (demo persistence).
 * Không phải DB production: restart giữ liệu, xóa file để reset sạch.
 * File: backend/db.snapshot.json (đã bị .gitignore chặn).
 */
const fs = require("fs");
const path = require("path");

const FILE = process.env.DB_SNAPSHOT_FILE || path.join(__dirname, "..", "db.snapshot.json");

function save(state) {
  try {
    // Ghi atomic tmp+rename: crash giữa chừng không làm hỏng snapshot (tránh mất dữ liệu).
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: new Date().toISOString(), ...state }));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.warn("[db] snapshot failed:", e.message);
  }
}

function load() {
  try {
    if (!fs.existsSync(FILE)) return null;
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    console.warn("[db] snapshot unreadable, reseeding:", e.message);
    return null;
  }
}

function wipe() {
  try {
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  } catch {}
}

module.exports = { save, load, wipe, FILE };
