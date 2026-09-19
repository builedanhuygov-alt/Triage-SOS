const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { canTransition, assertTransition, validTimelineState } = require("../lib/stateMachine");
const Auth = require("../lib/auth");

describe("stateMachine", () => {
  test("luồng NORMAL hợp lệ", () => {
    assert.ok(canTransition("CREATED", "SCREENING"));
    assert.ok(canTransition("SCREENING", "NORMAL"));
    assert.ok(canTransition("NORMAL", "ACTIVE"));
    assert.ok(canTransition("ACTIVE", "DISPATCHED"));
    assert.ok(canTransition("EN_ROUTE", "ARRIVED"));
  });

  test("FLAGGED chỉ đi APPROVE/DISMISS", () => {
    assert.ok(canTransition("FLAGGED", "ACTIVE"));
    assert.ok(canTransition("FLAGGED", "DISMISSED"));
    assert.ok(!canTransition("FLAGGED", "DISPATCHED"));
  });

  test("nhảy cóc bị chặn (400)", () => {
    assert.throws(() => assertTransition("CREATED", "ACTIVE"), /invalid transition/);
    assert.throws(() => assertTransition("FLAGGED", "RESOLVED"), /invalid transition/);
  });

  test("timeline states hợp lệ", () => {
    assert.ok(validTimelineState("AMBULANCE_DISPATCHED"));
    assert.ok(!validTimelineState("FLY_TO_MARS"));
  });
});

describe("auth", () => {
  test("login demo đúng -> token verify được", () => {
    const r = Auth.login("ceo@hospital.demo", "demo123");
    assert.ok(r.token);
    assert.equal(r.user.role, "CEO");
    const claims = Auth.verifyToken(r.token);
    assert.equal(claims.email, "ceo@hospital.demo");
  });

  test("sai pass -> null, token giả -> null", () => {
    assert.equal(Auth.login("ceo@hospital.demo", "sai"), null);
    assert.equal(Auth.verifyToken("gia.mao"), null);
    assert.equal(Auth.verifyToken("a.b"), null);
  });
});
