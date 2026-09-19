const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { screen, reset } = require("../lib/antiSabotage");

describe("antiSabotage", () => {
  test("tin sạch -> NORMAL", () => {
    reset();
    const r = screen({ symptom: "Dau nguc kho tho", deviceId: "d1" });
    assert.equal(r.verdict, "NORMAL");
    assert.ok(r.riskScore < 30);
  });

  test("spam 4 lần/phút -> FLAGGED", () => {
    reset();
    let r;
    for (let i = 0; i < 4; i++) r = screen({ symptom: "Cap cuu", deviceId: "spammer" });
    assert.equal(r.verdict, "FLAGGED");
    assert.ok(r.reasons.some((x) => x.includes("Too many")));
  });

  test("tin nhắn giống hệt lặp lại -> điểm tăng", () => {
    reset();
    screen({ symptom: "Kho tho", deviceId: "d2" });
    const r = screen({ symptom: "Kho tho", deviceId: "d2" });
    assert.ok(r.reasons.some((x) => x.includes("identical")));
    assert.ok(r.riskScore >= 30);
  });

  test("cụm từ test rõ ràng -> SUSPICIOUS+", () => {
    reset();
    const r = screen({ symptom: "test thu nghiem spam", deviceId: "d3" });
    assert.ok(["SUSPICIOUS", "FLAGGED"].includes(r.verdict));
  });

  test("tọa độ invalid -> cộng điểm", () => {
    reset();
    const r = screen({ symptom: "Dau bung", lat: 999, lng: 999, deviceId: "d4" });
    assert.ok(r.reasons.some((x) => x.includes("coordinates")));
  });

  test("nhảy vị trí bất khả thi -> cộng điểm", () => {
    reset();
    screen({ symptom: "A", lat: 10.7, lng: 106.6, deviceId: "d5" });
    const r = screen({ symptom: "B", lat: 48.8, lng: 2.3, deviceId: "d5" });
    assert.ok(r.reasons.some((x) => x.includes("jump")));
  });
});
