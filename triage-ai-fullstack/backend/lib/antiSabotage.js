/**
 * lib/antiSabotage — NORMAL | SUSPICIOUS | FLAGGED (không kết luận vội).
 * Pure functions → unit test được, không phụ thuộc Express/Socket.
 */
const norm = (s = "") =>
  String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

const SPAM_PHRASES = ["test", "thu nghiem", "spam", "alo alo", "demo pha", "phao tin"];

// Bộ nhớ trượt theo thiết bị/người gửi: Map<key, [{at, msg, lat, lng}]>
const history = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_KEEP = 20;

function keyOf(input = {}) {
  return input.deviceId || input.contactPhone || input.patientName || "anon";
}

function prune(key, now) {
  const arr = (history.get(key) || []).filter((e) => now - e.at < 5 * 60 * 1000);
  history.set(key, arr.slice(-MAX_KEEP));
  return arr;
}

function validCoords(lat, lng) {
  if (lat == null && lng == null) return true; // không gửi GPS vẫn hợp lệ
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
}

function haversineKm(a, b, c, d) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * @returns {{ verdict: "NORMAL"|"SUSPICIOUS"|"FLAGGED", riskScore: 0-100, reasons: string[] }}
 */
function screen(input = {}) {
  const now = Date.now();
  const key = keyOf(input);
  const past = prune(key, now);
  const reasons = [];
  let score = 0;

  const msg = norm(input.symptom || input.message || "");
  // 1) Quá nhiều request / phút
  const lastMin = past.filter((e) => now - e.at < WINDOW_MS);
  if (lastMin.length >= 3) { score += 45; reasons.push(`Too many requests: ${lastMin.length + 1}/minute`); }
  else if (lastMin.length >= 1) { score += 12; reasons.push("Repeat submission within 1 minute"); }

  // 2) Tin nhắn giống hệt lặp lại
  if (msg && past.some((e) => e.msg === msg)) { score += 30; reasons.push("Repeated identical message"); }

  // 3) Cụm từ test/spam rõ ràng
  if (SPAM_PHRASES.some((p) => msg.includes(p))) { score += 35; reasons.push("Obvious test/spam phrase"); }

  // 4) Tọa độ invalid
  if (!validCoords(input.lat ?? input.latitude, input.lng ?? input.longitude)) {
    score += 25; reasons.push("Invalid coordinates");
  }

  // 5) Nhảy vị trí bất khả thi (>500km trong <2 phút)
  const lat = Number(input.lat ?? input.latitude), lng = Number(input.lng ?? input.longitude);
  const prevGps = [...past].reverse().find((e) => e.lat != null);
  if (Number.isFinite(lat) && prevGps && now - prevGps.at < 2 * 60 * 1000) {
    const km = haversineKm(prevGps.lat, prevGps.lng, lat, lng);
    if (km > 500) { score += 40; reasons.push(`Impossible location jump: ${Math.round(km)}km`); }
  }

  history.get(key).push({ at: now, msg, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null });

  score = Math.min(100, score);
  const verdict = score >= 70 ? "FLAGGED" : score >= 30 ? "SUSPICIOUS" : "NORMAL";
  return { verdict, riskScore: score, reasons };
}

function reset() { history.clear(); }

module.exports = { screen, reset, validCoords, haversineKm };
