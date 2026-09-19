/**
 * lib/routesV2 — API nghiệp vụ V2 (BỆNH VIỆN ĐA KHOA TW DEMO1):
 * intake/encounter/journey/notes/diagnosis/orders/results/prescriptions/
 * bills/payments-QR/documents/capacity/resources-approval-2-cấp/anomaly/
 * SOS/meds-schedule/health/nearby/version/command-overview/notifications-filter.
 * Enforce RBAC mới (permissions2.can) ở backend/API — không bypass frontend.
 */
"use strict";
const crypto = require("crypto");

const QR_SECRET = process.env.QR_SECRET || "demo-qr-secret-not-for-production";

module.exports = function registerV2(ctx) {
  const { app, db, Auth, Hospital, Perms2, Bus, Care, Ops,
    audit, auditRich, notify, persist, ok, err, stamp, maybeAnomaly,
    rateLimit, idempotent } = ctx;
  const idem = typeof idempotent === "function" ? idempotent : () => (req, res, next) => next();
  const rl = typeof rateLimit === "function" ? rateLimit : () => (req, res, next) => next();
  const S = Care.stores, O = Ops.stores;

  const requirePerm = (perm) => (req, res, next) => {
    if (Perms2.can(req.user, perm)) return next();
    audit("PERM_DENIED", req.user.email, Perms2.rolesOf(req.user).join(","), "perm", perm, "denied");
    return err(res, 403, `forbidden: missing ${perm}`);
  };
  const DEMO1_TO_LEGACY = { emergency: "er", icu: "icu", cardiology: "cardio", orthopedic: "trauma", pulmonary: "respiratory", neurology: "neuro" };
  const normDept = (d) => DEMO1_TO_LEGACY[d] || d;
  const claimsDepts = (c) => [c.dept, c.department].filter(Boolean).map(normDept);
  const caregiverGrant = (claims) => {
    if (claims.role !== "CAREGIVER") return null;
    const now = Date.now();
    return db.grants.find((g) => g.caregiverId === claims.sub && (!g.expiresAt || new Date(g.expiresAt).getTime() > now)
      && (g.scopes || []).includes("MEDICAL_RECORD")) || null;
  };
  function encInScope(claims, enc) {
    const roles = Perms2.rolesOf(claims);
    // Lãnh đạo + chức năng toàn viện (tài chính xử lý hóa đơn mọi khoa,‐không sửa bệnh án)
    if (roles.some((r) => ["CEO", "ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "MEDICAL_BOARD", "FINANCE_MANAGER", "FINANCE_STAFF"].includes(r))) return true;
    if (roles.includes("PATIENT")) return !!claims.patientId && enc.patientId === claims.patientId;
    if (roles.includes("CAREGIVER")) { const g = caregiverGrant(claims); return !!g && enc.patientId === g.patientId; }
    return claimsDepts(claims).includes(normDept(enc.department));
  }
  function patientInScope(claims, patientId) {
    const roles = Perms2.rolesOf(claims);
    if (roles.some((r) => ["CEO", "ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "MEDICAL_BOARD"].includes(r))) return true;
    if (roles.includes("PATIENT")) return claims.patientId === patientId;
    if (roles.includes("CAREGIVER")) { const g = caregiverGrant(claims); return !!g && g.patientId === patientId; }
    // staff: có encounter nào của BN trong khoa mình
    return S.encounters.some((e) => e.patientId === patientId && claimsDepts(claims).includes(normDept(e.department)));
  }
  const denyScope = (req, res, resource, id) => {    audit("SCOPE_DENIED", req.user.email, Perms2.rolesOf(req.user).join(","), resource, id, "denied:out-of-scope");
    maybeAnomaly("OUT_OF_SCOPE_ACCESS", req.user.email, `Truy cập ngoài phạm vi: ${resource} ${id}`);
    return err(res, 403, "forbidden: ngoài phạm vi tổ chức");
  };
  function medInScope(claims, m) {
    const roles = Perms2.rolesOf(claims);
    if (roles.some((r) => ["CEO", "ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR"].includes(r))) return true;
    if (roles.includes("PATIENT")) return !!claims.patientId && m.patientId === claims.patientId;
    if (roles.includes("CAREGIVER")) { const g = caregiverGrant(claims); return !!g && m.patientId === g.patientId; }
    const rx = S.prescriptions.find((x) => x.id === m.prescriptionId);
    const e = rx && S.encounters.find((x) => x.id === rx.encounterId);
    return !!(e && claimsDepts(claims).includes(normDept(e.department)));
  }
  const inRange = (iso, range, from, to) => {
    const t = new Date(iso).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime() + 86399999) return false;
    if (!range || range === "all") return true;
    const now = Date.now(); const day = 864e5;
    if (range === "today") return t > now - day;
    if (range === "7d") return t > now - 7 * day;
    if (range === "30d") return t > now - 30 * day;
    return true;
  };

  /* ================= INTAKE + REGISTRY + CHART ================= */
  app.post("/api/patients/intake", Auth.authRequired, requirePerm("ENCOUNTER_CREATE"), idem(), (req, res) => {
    const b = req.body || {};
    if (!b.fullName) return err(res, 400, "missing required: fullName");
    const norm = (s) => String(s || "").toLowerCase().trim();
    const dup = S.registry.filter((p) =>
      (b.cccd && p.cccd === b.cccd) || (b.patientId && p.patientId === b.patientId) ||
      (b.bhytCode && p.bhyt && p.bhyt.code === b.bhytCode) ||
      (b.phone && p.phone === b.phone && norm(p.fullName) === norm(b.fullName)));
    if (dup.length && !b.confirmDuplicate) {
      audit("INTAKE_DUPLICATE", req.user.email, Perms2.rolesOf(req.user).join(","), "patient", b.cccd || b.phone || "?", "duplicate suspected");
      return res.status(409).json({ success: false, data: { candidates: dup }, error: "duplicate patient suspected (DUPLICATE PATIENT DETECTION) — gửi confirmDuplicate:true để tiếp tục", code: "CONFLICT", requestId: req.id || null, timestamp: stamp() });
    }
    const pid = b.patientId || Care.nextPatientId();
    let reg = S.registry.find((p) => p.patientId === pid);
    if (!reg) {
      reg = { patientId: pid, fullName: b.fullName, cccd: b.cccd || "", dob: b.dob || "", age: b.age ?? null,
        gender: b.gender || "", phone: b.phone || "", address: b.address || "", bloodType: b.bloodType || "",
        emergencyContact: b.emergencyContact || {}, allergies: b.allergies || [], conditions: b.conditions || [],
        currentMeds: b.currentMeds || [],
        bhyt: { code: b.bhytCode || "", provider: b.bhytProvider || "", expiresAt: b.bhytExpiresAt || "", status: "UNAVAILABLE" },
        createdAt: stamp(), isDemo: true };
      S.registry.push(reg);
      Bus.emit("PATIENT_REGISTERED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "patient", resourceId: pid, patientId: pid, title: "Bệnh nhân mới", body: `${pid} — ${b.fullName}`, category: "Intake" });
    }
    const enc = { id: Care.nextEncounterId(), patientId: pid, department: b.department || "er",
      building: b.building || "A", room: b.room || "", doctor: b.doctor || null,
      status: b.emergency ? "EMERGENCY" : "REGISTERED", symptom: b.symptom || "", createdAt: stamp(),
      createdBy: req.user.email, examAt: null, isDemo: true };
    S.encounters.unshift(enc);
    Bus.emit("ENCOUNTER_CREATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "encounter", resourceId: enc.id, patientId: pid, dept: normDept(enc.department), title: "Ca khám mới", body: `${enc.id} — ${reg.fullName}`, category: "Intake" });
    persist();
    res.status(201).json(ok({ patient: reg, encounter: enc }));
  });

  app.get("/api/patients/registry", Auth.authRequired, requirePerm("PATIENT_VIEW"), (req, res) => {
    const q = String(req.query.q || "").toLowerCase();
    let list = S.registry;
    if (q) list = list.filter((p) => [p.fullName, p.patientId, p.cccd, p.phone, (p.bhyt || {}).code].some((s) => String(s || "").toLowerCase().includes(q)));
    res.json(ok({ total: list.length, items: list.slice(0, 50), banner: "DEMO ENVIRONMENT — NOT FOR PRODUCTION" }));
  });

  // PATIENT CHART thống nhất (§XV) — 1 nguồn cho Hospital Web + Patient App
  app.get("/api/patients/:pid/chart", Auth.authRequired, requirePerm("PATIENT_VIEW"), (req, res) => {
    const pid = req.params.pid;
    const reg = S.registry.find((p) => p.patientId === pid);
    if (!reg) return err(res, 404, "patient_not_found");
    if (!patientInScope(req.user, pid)) return denyScope(req, res, "patient", pid);
    const encs = S.encounters.filter((e) => e.patientId === pid);
    const ids = new Set(encs.map((e) => e.id));
    const pick = (arr) => arr.filter((x) => x.encounterId && ids.has(x.encounterId));
    audit("PATIENT_VIEW", req.user.email, Perms2.rolesOf(req.user).join(","), "patient", pid, "ok");
    res.json(ok({ banner: "DEMO ENVIRONMENT — NOT FOR PRODUCTION (DEMO UI, không phải OFFICIAL MEDICAL RECORD)",
      profile: reg, bhyt: reg.bhyt, allergies: reg.allergies, conditions: reg.conditions,
      encounters: encs, diagnoses: pick(S.diagnoses), orders: pick(S.careOrders), results: pick(S.results),
      notes: pick(S.notes), prescriptions: pick(S.prescriptions),
      immunizations: pick(S.careOrders).filter((o) => o.kind === "VACCINE"),
      surgeries: encs.filter((e) => e.admission === "SURGERY"),
      admissions: encs.filter((e) => ["ADMITTED", "DISCHARGED"].includes(e.status)),
      followups: S.followups.filter((f) => f.patientId === pid),
      payments: S.payments.filter((p) => encs.some((e) => e.id === p.encounterId)) }));
  });

  /* ================= ENCOUNTERS ================= */
  app.get("/api/encounters", Auth.authRequired, requirePerm("ENCOUNTER_VIEW"), (req, res) => {
    const { status, department, building, doctor, range, from, to } = req.query;
    let list = [...S.encounters];
    if (status) list = list.filter((e) => e.status === status);
    if (department) list = list.filter((e) => normDept(e.department) === normDept(department));
    if (building) list = list.filter((e) => e.building === building);
    if (doctor) list = list.filter((e) => e.doctor === doctor);
    if (range || from || to) list = list.filter((e) => inRange(e.createdAt, range, from, to));
    const roles = Perms2.rolesOf(req.user);
    if (roles.includes("PATIENT")) list = list.filter((e) => e.patientId === req.user.patientId);
    else if (roles.includes("CAREGIVER")) { const g = caregiverGrant(req.user); list = g ? list.filter((e) => e.patientId === g.patientId) : []; }
    else if (!roles.some((r) => ["CEO", "ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "MEDICAL_BOARD"].includes(r))) {
      const mine = claimsDepts(req.user);
      list = list.filter((e) => mine.includes(normDept(e.department)));
    }
    res.json(ok({ total: list.length, items: list.slice(0, 100) }));
  });

  app.post("/api/encounters", Auth.authRequired, requirePerm("ENCOUNTER_CREATE"), idem(), (req, res) => {
    const b = req.body || {};
    if (!b.patientId) return err(res, 400, "missing required: patientId");
    const enc = { id: Care.nextEncounterId(), patientId: b.patientId, department: b.department || "er",
      building: b.building || "A", room: b.room || "", doctor: b.doctor || null,
      status: b.emergency ? "EMERGENCY" : "WAITING", symptom: b.symptom || "", createdAt: stamp(),
      createdBy: req.user.email, examAt: null, isDemo: true };
    S.encounters.unshift(enc);
    Bus.emit("ENCOUNTER_CREATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "encounter", resourceId: enc.id, patientId: b.patientId, dept: normDept(enc.department), title: "Ca khám mới", body: enc.id, category: "Intake" });
    persist();
    res.status(201).json(ok(enc));
  });

  app.get("/api/encounters/:id/journey", Auth.authRequired, requirePerm("ENCOUNTER_VIEW"), (req, res) => {
    const j = Care.journey(req.params.id);
    if (!j) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, j.encounter)) return denyScope(req, res, "encounter", req.params.id);
    res.json(ok({ ...j, banner: "DEMO ENVIRONMENT — NOT FOR PRODUCTION" }));
  });

  app.patch("/api/encounters/:id", Auth.authRequired, requirePerm("ENCOUNTER_CREATE"), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const before = { status: e.status, doctor: e.doctor };
    const { status, doctor } = req.body || {};
    if (status && !Care.ENCOUNTER_STATES.includes(status)) return err(res, 400, `status must be one of ${Care.ENCOUNTER_STATES.join(",")}`);
    if (status) e.status = status;
    if (doctor !== undefined) e.doctor = doctor;
    if (status === "IN_EXAM" && !e.examAt) e.examAt = stamp();
    const map = { WAITING: "TRIAGE_CREATED", ADMITTED: "PATIENT_ADMITTED", REFERRED: "PATIENT_TRANSFERRED", DISCHARGED: "PATIENT_DISCHARGED" };
    Bus.emit(map[status] || "ENCOUNTER_UPDATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "encounter", resourceId: e.id, patientId: e.patientId, dept: normDept(e.department),
      before, after: { status: e.status, doctor: e.doctor }, where: `${e.building}/${e.department}`,
      title: `Ca ${e.id}: ${status || "cập nhật"}`, body: `${before.status} -> ${e.status}`, category: "Clinical" });
    persist();
    res.json(ok(e));
  });

  /* ================= NOTES / DIAGNOSIS (BS duyệt, AI chỉ SUGGEST) ================= */
  app.post("/api/encounters/:id/notes", Auth.authRequired, requirePerm("CLINICAL_NOTE_CREATE"), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { text, kind = "NOTE", aiSuggested = false } = req.body || {};
    if (!text) return err(res, 400, "missing required: text");
    const n = { id: `NOTE-${String(Care.counters.note++).padStart(4, "0")}`, encounterId: e.id,
      patientId: e.patientId, text: String(text).slice(0, 2000), kind, aiSuggested: !!aiSuggested,
      confirmed: !aiSuggested, by: req.user.email, at: stamp() };
    S.notes.unshift(n);
    auditRich({ action: "CLINICAL_NOTE_CREATE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "note", resourceId: n.id, result: aiSuggested ? "ai-suggestion (REVIEW REQUIRED)" : "ok",
      where: e.id, after: { kind, aiSuggested }, why: "ghi nhận lâm sàng" });
    persist();
    res.status(201).json(ok(n));
  });
  app.post("/api/notes/:noteId/confirm", Auth.authRequired, requirePerm("CLINICAL_NOTE_UPDATE"), (req, res) => {
    const n = S.notes.find((x) => x.id === req.params.noteId);
    if (!n) return err(res, 404, "note_not_found");
    const roles = Perms2.rolesOf(req.user);
    if (!roles.some((r) => ["DOCTOR", "DEPARTMENT_HEAD", "DEPUTY_HEAD", "CEO"].includes(r)))
      return err(res, 403, "forbidden: bác sĩ xác nhận (AI SUGGESTION — REVIEW REQUIRED)");
    const before = { confirmed: n.confirmed };
    n.confirmed = true; n.confirmedBy = req.user.email; n.confirmedAt = stamp();
    auditRich({ action: "NOTE_CONFIRM", actor: req.user.email, role: roles.join(","), resource: "note",
      resourceId: n.id, result: "ok", before, after: { confirmed: true }, why: "BS duyệt nội dung AI đề xuất" });
    persist();
    res.json(ok(n));
  });

  app.get("/api/encounters/:id/diagnosis", Auth.authRequired, requirePerm("DIAGNOSIS_VIEW"), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    res.json(ok(S.diagnoses.filter((d) => d.encounterId === e.id)));
  });
  app.post("/api/encounters/:id/diagnosis", Auth.authRequired, requirePerm("DIAGNOSIS_UPDATE"), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { code = "", text } = req.body || {};
    if (!text) return err(res, 400, "missing required: text");
    const d = { id: `DX-${String(Care.counters.dx++).padStart(4, "0")}`, encounterId: e.id,
      patientId: e.patientId, code: String(code).slice(0, 50), text: String(text).slice(0, 1000),
      by: req.user.email, at: stamp() };
    S.diagnoses.unshift(d);
    auditRich({ action: "DIAGNOSIS_UPDATE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "diagnosis", resourceId: d.id, result: "ok", where: e.id, after: { code, text }, why: "BS chẩn đoán" });
    persist();
    res.status(201).json(ok(d));
  });

  /* ================= ORDERS / RESULTS ================= */
  app.post("/api/encounters/:id/orders", Auth.authRequired, requirePerm("ORDER_CREATE"), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { kind, test } = req.body || {};
    if (!kind || !test) return err(res, 400, "missing required: kind, test");
    if (!["LAB", "IMAGING", "PROCEDURE", "MEDICATION", "VACCINE", "OTHER"].includes(kind)) return err(res, 400, "kind must be LAB|IMAGING|PROCEDURE|MEDICATION|VACCINE|OTHER");
    const o = { id: Care.nextOrderId(), encounterId: e.id, patientId: e.patientId, kind,
      test: String(test).slice(0, 300), status: "ORDERED", orderedBy: req.user.email, createdAt: stamp() };
    S.careOrders.unshift(o);
    // mirror sang legacy labs để LabBoard/CĐHA hiện tại vẫn thấy (compat, không rewrite)
    if (["LAB", "IMAGING"].includes(kind)) {
      db.labs.unshift({ id: o.id, patientId: e.patientId, emergencyId: null, kind, test: o.test,
        status: "ORDERED", orderedBy: o.orderedBy, performedBy: "", result: "", createdAt: o.createdAt, completedAt: null });
    }
    const ev = kind === "LAB" ? "LAB_ORDER_CREATED" : kind === "IMAGING" ? "IMAGING_ORDER_CREATED" : "ENCOUNTER_UPDATED";
    Bus.emit(ev, { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "order",
      resourceId: o.id, patientId: e.patientId, dept: normDept(e.department), title: `Chỉ định ${kind}`, body: `${o.id}: ${o.test}`, category: "Clinical" });
    persist();
    res.status(201).json(ok(o));
  });
  app.patch("/api/care-orders/:id", Auth.authRequired, requirePerm("ORDER_CREATE"), (req, res) => {
    const o = S.careOrders.find((x) => x.id === req.params.id);
    if (!o) return err(res, 404, "order_not_found");
    const e = S.encounters.find((x) => x.id === o.encounterId);
    if (e && !encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { status } = req.body || {};
    if (!["ORDERED", "PROCESSING", "READY", "CANCELLED"].includes(status)) return err(res, 400, "status must be ORDERED|PROCESSING|READY|CANCELLED");
    const before = { status: o.status };
    o.status = status;
    const leg = db.labs.find((l) => l.id === o.id);
    if (leg) { leg.status = status === "READY" ? "READY" : status === "CANCELLED" ? "REVIEWED" : "PROCESSING"; }
    auditRich({ action: "ORDER_UPDATE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "order", resourceId: o.id, result: status, before, after: { status } });
    persist();
    res.json(ok(o));
  });
  app.post("/api/care-orders/:id/result", Auth.authRequired, requirePerm("RESULT_VERIFY"), (req, res) => {
    const o = S.careOrders.find((x) => x.id === req.params.id);
    if (!o) return err(res, 404, "order_not_found");
    const e = S.encounters.find((x) => x.id === o.encounterId);
    if (e && !encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { summary } = req.body || {};
    if (!summary) return err(res, 400, "missing required: summary");
    const r = { id: Care.nextResultId(), orderId: o.id, encounterId: o.encounterId, patientId: o.patientId,
      summary: String(summary).slice(0, 2000), status: "VERIFIED", verifiedBy: req.user.email,
      verifiedAt: stamp(), releasedAt: null };
    S.results.unshift(r);
    Bus.emit(o.kind === "IMAGING" ? "IMAGING_RESULT_RELEASED" : "LAB_RESULT_VERIFIED",
      { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "result", resourceId: r.id,
        patientId: o.patientId, dept: e ? normDept(e.department) : null, title: `Kết quả đã duyệt (${o.kind})`, body: `${r.id}: ${o.test}`, category: "Lab" });
    persist();
    res.status(201).json(ok(r));
  });
  app.post("/api/results/:id/release", Auth.authRequired, requirePerm("RESULT_VERIFY"), (req, res) => {
    const r = S.results.find((x) => x.id === req.params.id);
    if (!r) return err(res, 404, "result_not_found");
    const before = { status: r.status };
    r.status = "RELEASED"; r.releasedAt = stamp();
    Bus.emit("LAB_RESULT_RELEASED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "result", resourceId: r.id, patientId: r.patientId, title: "Kết quả đã phát hành",
      body: `${r.id} sẵn sàng trong Patient App`, category: "Lab" });
    auditRich({ action: "RESULT_RELEASE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "result", resourceId: r.id, result: "ok", before, after: { status: "RELEASED" } });
    persist();
    res.json(ok(r));
  });

  /* ================= PRESCRIPTION -> DISPENSE ================= */
  app.post("/api/encounters/:id/prescriptions", Auth.authRequired, requirePerm("PRESCRIPTION_CREATE"), idem(), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return err(res, 400, "missing required: items[]");
    const rx = { id: Care.nextRxId(), encounterId: e.id, patientId: e.patientId,
      items: items.map((it) => ({ drug: it.drug, dosage: it.dosage || "", times: it.times || ["08:00"],
        qty: it.qty || 0, instructions: it.instructions || "" })),
      status: "DRAFT", createdBy: req.user.email, createdAt: stamp() };
    S.prescriptions.unshift(rx);
    const ms = { id: Care.nextMsId(), prescriptionId: rx.id, patientId: e.patientId,
      doses: rx.items.flatMap((it) => (it.times || []).map((t) => ({ drug: it.drug, time: t, state: "SCHEDULED", remindAt: t, confirmedAt: null }))),
      createdAt: stamp() };
    S.medSchedules.unshift(ms);
    Bus.emit("PRESCRIPTION_CREATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "prescription", resourceId: rx.id, patientId: e.patientId, title: "Đơn thuốc mới",
      body: `${rx.id} — ${rx.items.length} loại`, category: "Pharmacy" });
    persist();
    res.status(201).json(ok({ prescription: rx, schedule: ms }));
  });
  app.post("/api/prescriptions/:id/approve", Auth.authRequired, requirePerm("PRESCRIPTION_APPROVE"), (req, res) => {
    const rx = S.prescriptions.find((x) => x.id === req.params.id);
    if (!rx) return err(res, 404, "prescription_not_found");
    const e = S.encounters.find((x) => x.id === rx.encounterId);
    if (e && !encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const before = { status: rx.status };
    rx.status = "APPROVED"; rx.approvedBy = req.user.email; rx.approvedAt = stamp();
    Bus.emit("PRESCRIPTION_APPROVED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "prescription", resourceId: rx.id, patientId: rx.patientId, before, after: { status: "APPROVED" },
      title: "Đơn đã duyệt", body: rx.id, category: "Pharmacy" });
    persist();
    res.json(ok(rx));
  });
  app.post("/api/prescriptions/:id/dispense", Auth.authRequired, requirePerm("RESOURCE_ISSUE"), (req, res) => {
    const rx = S.prescriptions.find((x) => x.id === req.params.id);
    if (!rx) return err(res, 404, "prescription_not_found");
    const roles = Perms2.rolesOf(req.user);
    if (!roles.some((r) => ["PHARMACIST", "CEO", "ADMIN"].includes(r))) return err(res, 403, "forbidden: dược sĩ cấp phát");
    if (rx.status !== "APPROVED") return err(res, 400, "prescription must be APPROVED first");
    const before = { status: rx.status };
    rx.status = "DISPENSED"; rx.dispensedBy = req.user.email; rx.dispensedAt = stamp();
    // mirror sang legacy medications để Patient App hiện tại thấy đơn (compat)
    for (const it of rx.items) {
      db.medications.unshift({ id: `M${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`,
        patientId: rx.patientId, name: it.drug, dosage: it.dosage, schedule: (it.times || []).join("/"),
        instructions: it.instructions, status: "active" });
    }
    Bus.emit("MEDICATION_DISPENSED", { actor: req.user.email, role: roles.join(","), resource: "prescription",
      resourceId: rx.id, patientId: rx.patientId, before, after: { status: "DISPENSED" },
      title: "Thuốc sẵn sàng", body: `${rx.id} — nhận tại quầy Dược`, category: "Pharmacy" });
    persist();
    res.json(ok(rx));
  });
  app.post("/api/encounters/:id/followups", Auth.authRequired, requirePerm("SCHEDULE_MANAGE"), idem(), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { date, time = "08:00", note = "", doctor = e.doctor } = req.body || {};
    if (!date) return err(res, 400, "missing required: date");
    const f = { id: Care.nextFollowupId(), encounterId: e.id, patientId: e.patientId, date, time,
      location: req.body.location || "", note, doctor, status: "SCHEDULED", createdBy: req.user.email, createdAt: stamp() };
    S.followups.unshift(f);
    db.appointments.unshift({ id: f.id, patientId: e.patientId, doctorId: doctor || "", departmentId: normDept(e.department),
      type: "FOLLOW_UP", date, time, location: f.location, note, status: "SCHEDULED" });
    Bus.emit("FOLLOWUP_CREATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "followup", resourceId: f.id, patientId: e.patientId, title: "Lịch tái khám",
      body: `${date} ${time} — ${note}`, category: "Appointment" });
    persist();
    res.status(201).json(ok(f));
  });

  /* ================= BHYT ADAPTER (ADAPTER READY, không giả vờ verify) ================= */
  app.post("/api/bhyt/verify", Auth.authRequired, requirePerm("BHYT_VERIFY"), (req, res) => {
    const { patientId, code } = req.body || {};
    if (!patientId) return err(res, 400, "missing required: patientId");
    const rec = { patientId, code: code || "", status: "MANUAL_REVIEW",
      source: "manual (chưa có API BHYT chính thức — DEMO / SIMULATED)",
      verifiedBy: null, at: stamp() };
    O.bhytChecks.unshift(rec);
    Bus.emit("ENCOUNTER_UPDATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "bhyt", resourceId: patientId, patientId, title: "BHYT chờ xác minh thủ công", body: code || "(chưa có mã)", category: "BHYT" });
    persist();
    res.status(201).json(ok({ ...rec, adapter: "ADAPTER READY", external: "DEMO / SIMULATED" }));
  });
  app.post("/api/bhyt/manual", Auth.authRequired, requirePerm("BHYT_VERIFY"), (req, res) => {
    const { patientId, result, note = "" } = req.body || {};
    if (!patientId || !Ops.BHYT_STATES.includes(result) || result === "VERIFYING")
      return err(res, 400, `result must be one of ${Ops.BHYT_STATES.filter((s) => s !== "VERIFYING").join(",")}`);
    const before = O.bhytChecks.find((x) => x.patientId === patientId);
    const rec = { patientId, code: (before && before.code) || req.body.code || "", status: result,
      source: "manual", note, verifiedBy: req.user.email, at: stamp() };
    O.bhytChecks.unshift(rec);
    const reg = S.registry.find((p) => p.patientId === patientId);
    if (reg) reg.bhyt = { ...(reg.bhyt || {}), status: result };
    auditRich({ action: "BHYT_MANUAL_VERIFY", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "bhyt", resourceId: patientId, result, before: before ? { status: before.status } : null,
      after: { status: result }, why: note || "xác minh thủ công" });
    persist();
    res.status(201).json(ok(rec));
  });
  app.get("/api/bhyt/:patientId", Auth.authRequired, requirePerm("BHYT_VIEW"), (req, res) => {
    const roles = Perms2.rolesOf(req.user);
    if (roles.includes("PATIENT") && req.user.patientId !== req.params.patientId) return denyScope(req, res, "bhyt", req.params.patientId);
    const list = O.bhytChecks.filter((x) => x.patientId === req.params.patientId);
    res.json(ok({ history: list, current: list[0] || null, adapter: "ADAPTER READY", external: "DEMO / SIMULATED" }));
  });

  /* ================= BILLS / PAYMENTS + QR ================= */
  const signQr = (payload) => crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex").slice(0, 16);
  app.post("/api/encounters/:id/bills", Auth.authRequired, requirePerm("PAYMENT_CREATE"), idem(), (req, res) => {
    const e = S.encounters.find((x) => x.id === req.params.id);
    if (!e) return err(res, 404, "encounter_not_found");
    if (!encInScope(req.user, e)) return denyScope(req, res, "encounter", e.id);
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return err(res, 400, "missing required: items[]");
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const bill = { id: Care.nextBillId(), encounterId: e.id, patientId: e.patientId, items, total,
      status: "UNPAID", createdBy: req.user.email, createdAt: stamp() };
    S.bills.unshift(bill);
    const pay = { id: Care.nextPayId(), billId: bill.id, encounterId: e.id, patientId: e.patientId,
      amount: total, method: null, status: "UNPAID", createdAt: stamp(), expiresAt: new Date(Date.now() + 24 * 36e5).toISOString() };
    // QR không chứa thông tin y tế nhạy cảm: chỉ mã GD + tiền + nội dung + BN/ca + hạn
    const qrCore = `PAY|${pay.id}|${pay.amount}|Vien phi ${bill.id}|${e.patientId}|${e.id}|${pay.expiresAt}`;
    pay.qr = `${qrCore}|SIG:${signQr(qrCore)}`;
    S.payments.unshift(pay);
    Bus.emit("PAYMENT_CREATED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "payment", resourceId: pay.id, patientId: e.patientId, title: "Hóa đơn mới",
      body: `${bill.id} — ${total}đ (QR sẵn sàng)`, category: "Payment" });
    persist();
    res.status(201).json(ok({ bill, payment: pay }));
  });
  app.get("/api/payments/:id/qr", Auth.authRequired, requirePerm("BILL_VIEW"), (req, res) => {
    const p = S.payments.find((x) => x.id === req.params.id);
    if (!p) return err(res, 404, "payment_not_found");
    res.json(ok({ qr: p.qr, amount: p.amount, expiresAt: p.expiresAt, note: "QR demo — không chứa dữ liệu y tế nhạy cảm" }));
  });
  app.post("/api/payments/:id/confirm", Auth.authRequired, requirePerm("PAYMENT_VERIFY"), idem(), (req, res) => {
    const p = S.payments.find((x) => x.id === req.params.id);
    if (!p) return err(res, 404, "payment_not_found");
    const { method = "CASH", receivedBy = req.user.email, amount = p.amount, payer = "" } = req.body || {};
    if (!["CASH", "TRANSFER", "QR"].includes(method)) return err(res, 400, "method must be CASH|TRANSFER|QR");
    // Idempotency/guard: đã PAID thì không tạo giao dịch mới — trùng khớp trả hiện tại, khác trả 409.
    if (p.status === "PAID") {
      if (method === p.method && Number(amount) === Number(p.paidAmount ?? p.amount)) {
        return res.json(ok({ payment: p, receipt: { txn: p.id, amount: p.paidAmount, method: p.method, receivedBy: p.receivedBy, payer: p.payer, at: p.paidAt }, idempotent: true }));
      }
      return err(res, 409, "payment already PAID (dùng refund flow để hoàn tiền)");
    }
    const before = { status: p.status };
    p.status = "PAID"; p.method = method; p.receivedBy = receivedBy; p.payer = payer;
    p.paidAmount = amount; p.paidAt = stamp();
    const bill = S.bills.find((b) => b.id === p.billId);
    if (bill) bill.status = "PAID";
    Bus.emit("PAYMENT_CONFIRMED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "payment", resourceId: p.id, patientId: p.patientId, before, after: { status: "PAID", method },
      where: "Kế toán", title: "Đã thanh toán", body: `${p.id} — ${amount}đ (${method})`, category: "Payment" });
    persist();
    res.json(ok({ payment: p, receipt: { txn: p.id, amount, method, receivedBy, payer, at: p.paidAt } }));
  });
  app.post("/api/payments/:id/refund", Auth.authRequired, requirePerm("REFUND_APPROVE"), (req, res) => {
    const p = S.payments.find((x) => x.id === req.params.id);
    if (!p) return err(res, 404, "payment_not_found");
    if (p.status !== "PAID") return err(res, 400, "only PAID payments can be refunded");
    const before = { status: p.status };
    p.status = "REFUNDED"; p.refundedBy = req.user.email; p.refundedAt = stamp(); p.refundReason = (req.body || {}).reason || "";
    auditRich({ action: "REFUND_APPROVE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "payment", resourceId: p.id, result: "ok", before, after: { status: "REFUNDED" }, why: p.refundReason });
    persist();
    res.json(ok(p));
  });

  /* ================= DOCUMENTS (văn thư, phê duyệt 2 cấp) ================= */
  app.get("/api/documents", Auth.authRequired, (req, res) => {
    if (!["DOCUMENT_CREATE", "DOCUMENT_RECEIVE", "DOCUMENT_PROCESS", "DOCUMENT_APPROVE"].some((p) => Perms2.can(req.user, p)))
      return err(res, 403, "forbidden: missing document permission");
    const { status, direction } = req.query;
    const now = Date.now();
    let list = O.documents.map((d) => ({ ...d,
      computedStatus: d.status !== "DONE" && d.deadline && new Date(d.deadline).getTime() < now ? "OVERDUE" : d.status }));
    if (status) list = list.filter((d) => d.computedStatus === status || d.status === status);
    if (direction) list = list.filter((d) => d.direction === direction);
    res.json(ok({ total: list.length, items: list }));
  });
  app.post("/api/documents", Auth.authRequired, requirePerm("DOCUMENT_CREATE"), idem(), (req, res) => {
    const { direction = "IN", title, deadline = "", handler = "" } = req.body || {};
    if (!title) return err(res, 400, "missing required: title");
    if (!["IN", "OUT"].includes(direction)) return err(res, 400, "direction must be IN|OUT");
    const d = { id: `CV-2026-${String(Ops.counters.doc++).padStart(4, "0")}`, direction, title,
      status: "RECEIVED", deadline, handler, createdBy: req.user.email, createdAt: stamp(), history: [], isDemo: true };
    O.documents.unshift(d);
    Bus.emit("DOCUMENT_RECEIVED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "document", resourceId: d.id, title: "Công văn mới", body: `${d.id}: ${title}`, category: "Document" });
    persist();
    res.status(201).json(ok(d));
  });
  const docTransition = (perm, from, to, evType) => (req, res) => {
    if (!Perms2.can(req.user, perm)) return err(res, 403, `forbidden: missing ${perm}`);
    const d = O.documents.find((x) => x.id === req.params.id);
    if (!d) return err(res, 404, "document_not_found");
    if (!from.includes(d.status)) return err(res, 400, `cannot transition from ${d.status}`);
    const before = { status: d.status };
    d.status = to;
    d.history.push({ from: before.status, to, by: req.user.email, at: stamp(), note: (req.body || {}).note || "" });
    if (evType) Bus.emit(evType, { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "document", resourceId: d.id, before, after: { status: to }, title: `Văn bản ${to}`, body: d.id, category: "Document" });
    persist();
    res.json(ok(d));
  };
  app.post("/api/documents/:id/receive", Auth.authRequired, docTransition("DOCUMENT_RECEIVE", ["RECEIVED"], "PROCESSING", null));
  app.patch("/api/documents/:id/process", Auth.authRequired, docTransition("DOCUMENT_PROCESS", ["PROCESSING", "RECEIVED"], "PENDING_APPROVAL", null));
  app.post("/api/documents/:id/approve", Auth.authRequired, docTransition("DOCUMENT_APPROVE", ["PENDING_APPROVAL"], "DONE", "DOCUMENT_APPROVED"));

  /* ================= CAPACITY (FULL không từ chối cấp cứu) ================= */
  app.get("/api/capacity", Auth.authRequired, requirePerm("CAPACITY_VIEW"), (req, res) => {
    res.json(ok(O.capacity));
  });
  app.patch("/api/capacity/:dept", Auth.authRequired, requirePerm("CAPACITY_MANAGE"), (req, res) => {
    let c = O.capacity.find((x) => x.department === req.params.dept);
    if (!c) { c = { department: req.params.dept }; O.capacity.push(c); }
    const before = { ...c };
    const { status, threshold, openSlots, bedsFree, bedsTotal } = req.body || {};
    if (status && !Ops.CAPACITY_STATES.includes(status)) return err(res, 400, `status must be one of ${Ops.CAPACITY_STATES.join(",")}`);
    Object.assign(c, { ...(status && { status }), ...(threshold !== undefined && { threshold }),
      ...(openSlots !== undefined && { openSlots }), ...(bedsFree !== undefined && { bedsFree }),
      ...(bedsTotal !== undefined && { bedsTotal }), updatedAt: stamp(), updatedBy: req.user.email });
    const guidance = ["FULL", "CRITICAL", "EMERGENCY"].includes(c.status)
      ? "ESCALATE/TRANSFER/REQUEST SUPPORT theo quy trình — KHÔNG tự từ chối bệnh nhân cấp cứu vì FULL."
      : null;
    auditRich({ action: "CAPACITY_UPDATE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "capacity", resourceId: c.department, result: c.status || "ok", before, after: { ...c } });
    persist();
    res.json(ok({ ...c, guidance }));
  });

  /* ================= RESOURCES + APPROVAL 2 CẤP ================= */
  const alertLevel = (r) => {
    const st = Ops.resourceStatus(r);
    if (st === "OUT_OF_STOCK" || st === "EXPIRED") return "CRITICAL";
    if (st === "CRITICAL" || st === "QUARANTINED") return "HIGH";
    if (st === "LOW") return "WARNING";
    return "INFO";
  };
  app.get("/api/resources", Auth.authRequired, requirePerm("RESOURCE_VIEW"), (req, res) => {
    const { building, department, status } = req.query;
    let list = O.resources.map((r) => ({ ...r, status: Ops.resourceStatus(r) }));
    if (building) list = list.filter((r) => r.building === building);
    if (department) list = list.filter((r) => r.department === department);
    if (status) list = list.filter((r) => r.status === status);
    res.json(ok({ total: list.length, items: list, banner: "DEMO ENVIRONMENT — NOT FOR PRODUCTION" }));
  });
  app.post("/api/resources", Auth.authRequired, requirePerm("RESOURCE_CREATE"), (req, res) => {
    const b = req.body || {};
    if (!b.name || b.qty === undefined) return err(res, 400, "missing required: name, qty");
    const r = { id: `RES-${String(Ops.counters.res++).padStart(4, "0")}`, name: b.name, type: b.type || "SUPPLY",
      unit: b.unit || "cái", qty: Number(b.qty) || 0, minQty: Number(b.minQty) || 0, alertQty: Number(b.alertQty) || 0,
      batch: b.batch || "", expiry: b.expiry || "", building: b.building || "", floor: b.floor ?? "",
      department: b.department || "", room: b.room || "", manager: b.manager || req.user.email,
      quarantined: false, history: [{ at: stamp(), by: req.user.email, change: `Tạo mới: ${b.qty}` }],
      updatedAt: stamp(), isDemo: true };
    r.status = Ops.resourceStatus(r);
    O.resources.unshift(r);
    auditRich({ action: "RESOURCE_CREATE", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "resource", resourceId: r.id, result: "ok", after: { name: r.name, qty: r.qty } });
    persist();
    res.status(201).json(ok(r));
  });
  app.get("/api/resource-alerts", Auth.authRequired, requirePerm("RESOURCE_VIEW"), (req, res) => {
    // Command Center nhận cảnh báo tồn kho theo mức INFO/WARNING/HIGH/CRITICAL
    const alerts = O.resources.map((r) => ({ ...r, status: Ops.resourceStatus(r) }))
      .filter((r) => r.status !== "NORMAL")
      .map((r) => ({ id: r.id, name: r.name, qty: r.qty, unit: r.unit, status: r.status,
        priority: alertLevel(r), location: `${r.building}/${r.department}/${r.room}`, manager: r.manager }));
    res.json(ok({ total: alerts.length, items: alerts }));
  });
  // Trưởng khoa REQUEST (DRAFT -> SUBMITTED -> PENDING_APPROVAL), lưu trước/sau
  app.post("/api/resources/:id/request", Auth.authRequired, requirePerm("RESOURCE_REQUEST"), idem(), (req, res) => {
    const r = O.resources.find((x) => x.id === req.params.id);
    if (!r) return err(res, 404, "resource_not_found");
    const { qty, reason = "" } = req.body || {};
    if (!qty || Number(qty) <= 0) return err(res, 400, "qty must be > 0");
    const a = { id: `APR-${String(Ops.counters.apr++).padStart(4, "0")}`, kind: "RESOURCE", refId: r.id,
      change: -Math.abs(Number(qty)), qtyBefore: r.qty, qtyAfter: r.qty - Math.abs(Number(qty)),
      reason, state: "PENDING_APPROVAL", createdBy: req.user.email, submittedBy: req.user.email,
      submittedAt: stamp(), processedBy: null, approvedBy: null, history: [{ at: stamp(), by: req.user.email, event: "SUBMITTED" }] };
    O.approvals.unshift(a);
    persist();
    res.status(201).json(ok(a));
  });
  // Kho PROCESS
  app.post("/api/approvals/:id/process", Auth.authRequired, requirePerm("RESOURCE_ISSUE"), (req, res) => {
    const a = O.approvals.find((x) => x.id === req.params.id);
    if (!a) return err(res, 404, "approval_not_found");
    if (a.state !== "PENDING_APPROVAL") return err(res, 400, `cannot process from ${a.state}`);
    a.processedBy = req.user.email; a.processedAt = stamp();
    a.history.push({ at: stamp(), by: req.user.email, event: "PROCESSED_BY_WAREHOUSE" });
    persist();
    res.json(ok(a));
  });
  // Authority APPROVE (áp số lượng + history, không sửa lịch sử trực tiếp)
  app.post("/api/approvals/:id/approve", Auth.authRequired, requirePerm("RESOURCE_APPROVE"), (req, res) => {
    const a = O.approvals.find((x) => x.id === req.params.id);
    if (!a) return err(res, 404, "approval_not_found");
    if (a.state !== "PENDING_APPROVAL") return err(res, 400, `cannot approve from ${a.state}`);
    const { decision = "APPROVE", note = "" } = req.body || {};
    if (!["APPROVE", "REJECT"].includes(decision)) return err(res, 400, "decision must be APPROVE|REJECT");
    const r = O.resources.find((x) => x.id === a.refId);
    if (decision === "REJECT") {
      a.state = "REJECTED"; a.history.push({ at: stamp(), by: req.user.email, event: "REJECTED", note });
    } else {
      a.state = "APPROVED";
      a.approvedBy = req.user.email; a.approvedAt = stamp();
      if (r) {
        const before = { qty: r.qty };
        r.qty = a.qtyAfter;
        r.history.push({ at: stamp(), by: req.user.email, change: `${before.qty} -> ${r.qty} (${a.reason})` });
        r.status = Ops.resourceStatus(r); r.updatedAt = stamp();
        a.history.push({ at: stamp(), by: req.user.email, event: "APPROVED", note });
        a.state = "ACTIVE";
        const lvl = alertLevel(r);
        if (lvl !== "INFO") Bus.emit(r.status === "OUT_OF_STOCK" || r.status === "EXPIRED" ? "RESOURCE_CRITICAL" : "RESOURCE_LOW",
          { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "resource", resourceId: r.id,
            title: `${r.status}: ${r.name}`, body: `Còn ${r.qty} ${r.unit} tại ${r.building}/${r.department}`, category: "Resource" });
        Bus.emit("RESOURCE_APPROVED", { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
          resource: "approval", resourceId: a.id, before, after: { qty: r.qty }, why: a.reason,
          title: "Phê duyệt xuất kho", body: `${a.id}: ${r.name}`, category: "Resource" });
      }
    }
    persist();
    res.json(ok(a));
  });
  app.get("/api/approvals", Auth.authRequired, requirePerm("RESOURCE_VIEW"), (req, res) => {
    const { state } = req.query;
    let list = [...O.approvals];
    if (state) list = list.filter((a) => a.state === state);
    res.json(ok({ total: list.length, items: list }));
  });

  /* ================= ANOMALY CENTER (ANOMALY_DETECTED -> REVIEW CASE) ================= */
  app.get("/api/anomaly/cases", Auth.authRequired, requirePerm("ANOMALY_VIEW"), (req, res) => {
    const { state } = req.query;
    let list = [...O.anomalyCases];
    if (state) list = list.filter((c) => c.state === state);
    res.json(ok({ total: list.length, items: list, note: "ANOMALY DETECTED — cần người có thẩm quyền xác minh, không tự kết luận/khóa tài khoản." }));
  });
  app.post("/api/anomaly/cases/:id/review", Auth.authRequired, requirePerm("ANOMALY_REVIEW"), (req, res) => {
    const c = O.anomalyCases.find((x) => x.id === req.params.id);
    if (!c) return err(res, 404, "case_not_found");
    const { decision, note = "" } = req.body || {};
    if (!["RESOLVED", "DISMISSED"].includes(decision)) return err(res, 400, "decision must be RESOLVED|DISMISSED");
    const before = { state: c.state };
    c.state = decision === "RESOLVED" ? "RESOLVED" : "DISMISSED";
    c.reviewedBy = req.user.email; c.reviewedAt = stamp(); c.note = note;
    auditRich({ action: "ANOMALY_REVIEW", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "anomaly", resourceId: c.id, result: c.state, before, after: { state: c.state }, why: note });
    persist();
    res.json(ok(c));
  });

  /* ================= SOS LIFECYCLE (public tạo, staff xử lý) ================= */
  app.post("/api/sos", rl(30, 60000), idem(), (req, res) => {
    const b = req.body || {};
    const c = { id: Care.nextSosId(), patientId: b.patientId || null, name: b.name || "",
      phone: b.phone || "", lat: b.lat ?? null, lng: b.lng ?? null,
      contact: b.contact || {}, medicalId: b.medicalId || "",
      status: "SOS_REQUESTED", simulated: true, createdAt: stamp(), history: [{ status: "SOS_REQUESTED", at: stamp() }] };
    S.sosCases.unshift(c);
    Bus.emit("SOS_CREATED", { actor: b.name || "Patient App", role: "PATIENT", resource: "sos", resourceId: c.id,
      patientId: c.patientId, title: "SOS mới (DEMO/SIMULATED)", body: `${c.id} — ${c.name || "chưa rõ tên"}`, category: "SOS" });
    persist();
    res.status(201).json(ok({ ...c, note: "DEMO / SIMULATED — chưa điều phối cấp cứu thật" }));
  });
  app.get("/api/sos", Auth.authRequired, requirePerm("SOS_VIEW"), (req, res) => {
    const { status } = req.query;
    let list = [...S.sosCases];
    if (status) list = list.filter((c) => c.status === status);
    res.json(ok({ total: list.length, items: list }));
  });
  app.patch("/api/sos/:id", Auth.authRequired, requirePerm("SOS_UPDATE"), (req, res) => {
    const c = S.sosCases.find((x) => x.id === req.params.id);
    if (!c) return err(res, 404, "sos_not_found");
    const { status } = req.body || {};
    const order = ["SOS_REQUESTED", "ACKNOWLEDGED", "DISPATCHING", "EN_ROUTE", "ARRIVED", "CLOSED"];
    if (!order.includes(status)) return err(res, 400, `status must be one of ${order.join(",")}`);
    if (order.indexOf(status) < order.indexOf(c.status)) return err(res, 400, "cannot move SOS backwards");
    const before = { status: c.status };
    c.status = status; c.history.push({ status, by: req.user.email, at: stamp() });
    const ev = { ACKNOWLEDGED: "SOS_ACKNOWLEDGED", DISPATCHING: "SOS_DISPATCHING", ARRIVED: "SOS_ARRIVED", CLOSED: "SOS_CLOSED" }[status];
    if (ev) Bus.emit(ev, { actor: req.user.email, role: Perms2.rolesOf(req.user).join(","), resource: "sos",
      resourceId: c.id, patientId: c.patientId, before, after: { status }, title: `SOS ${status}`, body: c.id, category: "SOS" });
    persist();
    res.json(ok(c));
  });

  /* ================= MEDICATION SCHEDULE (Taken/Missed, không tự đánh dấu) ================= */
  app.get("/api/meds/schedule", Auth.authRequired, requirePerm("SCHEDULE_VIEW"), (req, res) => {
    const { patientId } = req.query;
    const roles = Perms2.rolesOf(req.user);
    let pid = patientId;
    if (roles.includes("PATIENT")) pid = req.user.patientId;
    if (roles.includes("CAREGIVER")) { const g = caregiverGrant(req.user); if (!g) return err(res, 403, "forbidden: no caregiver grant"); pid = g.patientId; }
    let list = S.medSchedules.filter((m) => !pid || m.patientId === pid);
    if (!roles.some((r) => ["CEO", "ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR"].includes(r)) && !roles.includes("PATIENT") && !roles.includes("CAREGIVER")) {
      // staff khác: lọc theo khoa của encounter liên quan
      list = list.filter((m) => { const rx = S.prescriptions.find((x) => x.id === m.prescriptionId); const e = rx && S.encounters.find((x) => x.id === rx.encounterId); return e && claimsDepts(req.user).includes(normDept(e.department)); });
    }
    res.json(ok({ total: list.length, items: list }));
  });
  app.post("/api/meds/schedule/:id/remind", Auth.authRequired, requirePerm("SCHEDULE_VIEW"), (req, res) => {
    const m = S.medSchedules.find((x) => x.id === req.params.id);
    if (!m) return err(res, 404, "schedule_not_found");
    if (!medInScope(req.user, m)) return denyScope(req, res, "schedule", m.id);
    let n = 0;
    for (const d of m.doses) if (d.state === "SCHEDULED") { d.state = "REMINDER"; n++; }
    if (n) notify(null, "Medication", "Nhắc uống thuốc", `${m.id}: ${n} liều tới giờ (xác nhận ĐÃ UỐNG mới tính TAKEN)`, { patientId: m.patientId });
    persist();
    res.json(ok({ reminded: n, schedule: m }));
  });
  app.post("/api/meds/schedule/:id/confirm", Auth.authRequired, requirePerm("SCHEDULE_VIEW"), (req, res) => {
    const m = S.medSchedules.find((x) => x.id === req.params.id);
    if (!m) return err(res, 404, "schedule_not_found");
    if (!medInScope(req.user, m)) return denyScope(req, res, "schedule", m.id);
    const { doseIndex } = req.body || {};
    const d = m.doses[doseIndex];
    if (!d) return err(res, 404, "dose_not_found");
    // Chỉ chuyển TAKEN khi có xác nhận tường minh; không tự đánh dấu vì đến giờ
    if (!["SCHEDULED", "REMINDER", "PENDING"].includes(d.state)) return err(res, 400, `dose already ${d.state}`);
    d.state = "TAKEN"; d.confirmedAt = stamp(); d.confirmedBy = req.user.email;
    O.healthPoints.push({ patientId: m.patientId, kind: "MEDICATION", value: `${d.drug} đã uống (${d.time})`, unit: "", at: stamp(), source: "PATIENT" });
    auditRich({ action: "MEDICATION_TAKEN", actor: req.user.email, role: Perms2.rolesOf(req.user).join(","),
      resource: "dose", resourceId: `${m.id}#${doseIndex}`, result: "TAKEN", after: { drug: d.drug, time: d.time } });
    persist();
    res.json(ok(m));
  });
  app.post("/api/meds/schedule/:id/sweep", Auth.authRequired, requirePerm("SCHEDULE_VIEW"), (req, res) => {
    const m = S.medSchedules.find((x) => x.id === req.params.id);
    if (!m) return err(res, 404, "schedule_not_found");
    if (!medInScope(req.user, m)) return denyScope(req, res, "schedule", m.id);
    const now = new Date().toTimeString().slice(0, 5);
    let n = 0;
    for (const d of m.doses) {
      if (["SCHEDULED", "REMINDER", "PENDING"].includes(d.state) && (!d.time || d.time < now)) { d.state = "MISSED"; n++; }
    }
    if (n) notify(null, "Medication", "Liều thuốc bị lỡ", `${m.id}: ${n} liều MISSED — hỏi bác sĩ/dược sĩ, không tự uống bù`, { patientId: m.patientId });
    persist();
    res.json(ok({ missed: n, schedule: m }));
  });

  /* ================= HEALTH DATA (connect/permission/sync/disconnect) ================= */
  const selfPid = (req, pid) => {
    const roles = Perms2.rolesOf(req.user);
    if (roles.includes("PATIENT")) return req.user.patientId === (pid || req.user.patientId) ? (pid || req.user.patientId) : null;
    if (roles.includes("CAREGIVER")) { const g = caregiverGrant(req.user); return g ? g.patientId : null; }
    return pid || null;
  };
  app.post("/api/health-links", Auth.authRequired, (req, res) => {
    const roles = Perms2.rolesOf(req.user);
    if (!roles.includes("PATIENT")) return err(res, 403, "forbidden: patient only");
    const { source, device = "", permission = {} } = req.body || {};
    if (!["WEARABLE", "PLATFORM"].includes(source)) return err(res, 400, "source must be WEARABLE|PLATFORM");
    const pid = req.user.patientId;
    let link = O.healthLinks.find((l) => l.patientId === pid && l.source === source);
    if (!link) { link = { patientId: pid, source, device, connected: true, permission, lastSync: null, dataSource: device || source }; O.healthLinks.push(link); }
    else Object.assign(link, { device, connected: true, permission });
    auditRich({ action: "HEALTH_CONNECT", actor: req.user.email, role: "PATIENT", resource: "health", resourceId: pid, result: source, after: { device } });
    persist();
    res.status(201).json(ok(link));
  });
  app.patch("/api/health-links", Auth.authRequired, (req, res) => {
    const roles = Perms2.rolesOf(req.user);
    if (!roles.includes("PATIENT")) return err(res, 403, "forbidden: patient only");
    const link = O.healthLinks.find((l) => l.patientId === req.user.patientId && l.source === req.body.source);
    if (!link) return err(res, 404, "link_not_found");
    const before = { connected: link.connected, permission: link.permission };
    if (req.body.disconnect) link.connected = false;
    if (req.body.permission) link.permission = req.body.permission;
    auditRich({ action: "HEALTH_LINK_UPDATE", actor: req.user.email, role: "PATIENT", resource: "health",
      resourceId: link.patientId, result: "ok", before, after: { connected: link.connected } });
    persist();
    res.json(ok(link));
  });
  app.post("/api/health-links/sync", Auth.authRequired, (req, res) => {
    const roles = Perms2.rolesOf(req.user);
    if (!roles.includes("PATIENT")) return err(res, 403, "forbidden: patient only");
    const { source, points } = req.body || {};
    const link = O.healthLinks.find((l) => l.patientId === req.user.patientId && l.source === source && l.connected);
    if (!link) return err(res, 400, "no connected link (CONNECT + PERMISSION trước)");
    if (!Array.isArray(points)) return err(res, 400, "points[] required");
    for (const p of points.slice(0, 100)) {
      O.healthPoints.push({ patientId: req.user.patientId, kind: p.kind, value: p.value, unit: p.unit || "",
        at: p.at || stamp(), source: "DEVICE" });
    }
    link.lastSync = stamp();
    persist();
    res.status(201).json(ok({ synced: points.length, lastSync: link.lastSync }));
  });
  app.get("/api/health-links/status", Auth.authRequired, (req, res) => {
    const pid = selfPid(req, req.query.patientId);
    if (!pid) return err(res, 403, "forbidden");
    res.json(ok(O.healthLinks.filter((l) => l.patientId === pid)));
  });
  app.get("/api/health-links/timeline", Auth.authRequired, (req, res) => {
    const pid = selfPid(req, req.query.patientId);
    if (!pid) return err(res, 403, "forbidden");
    const pts = O.healthPoints.filter((p) => p.patientId === pid);
    const fus = S.followups.filter((f) => f.patientId === pid).map((f) => ({ kind: "APPOINTMENT", value: `${f.date} ${f.time} — ${f.note}`, at: f.createdAt, source: "HOSPITAL" }));
    const rels = S.results.filter((r) => r.patientId === pid && r.status === "RELEASED").map((r) => ({ kind: "LAB_RESULT", value: r.summary, at: r.releasedAt, source: "DOCTOR" }));
    const tl = [...pts, ...fus, ...rels].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 100);
    res.json(ok({ patientId: pid, items: tl }));
  });

  /* ================= NEARBY / VERSION ================= */
  const haversine = (a, b, c, d) => {
    const R = 6371, t = (x) => (x * Math.PI) / 180;
    const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  app.get("/api/hospitals/nearby", (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    const { specialty, emergency } = req.query;
    let list = [...Ops.NEARBY_HOSPITALS];
    if (specialty) list = list.filter((h) => (h.specialties || []).some((s) => s.toLowerCase().includes(String(specialty).toLowerCase())));
    if (emergency === "1") list = list.filter((h) => h.emergency);
    const items = list.map((h) => {
      const km = Number.isFinite(lat) && Number.isFinite(lng) ? +haversine(lat, lng, h.lat, h.lng).toFixed(1) : h.demoDistanceKm;
      return { id: h.id, name: h.name, address: h.address, phone: h.phone, specialties: h.specialties,
        emergency: h.emergency, distanceKm: km, etaMin: Math.max(3, Math.round((km / 30) * 60)),
        status: "DEMO / SIMULATED (không khẳng định giường/trực tiếp nhận realtime)",
        actions: ["CALL", "DIRECTIONS", "SOS"] };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
    res.json(ok({ items, map: "ADAPTER READY (tích hợp dịch vụ bản đồ khi có key)", realtime: false }));
  });
  app.get("/api/app/version", (_req, res) => {
    res.json(ok({ ...Ops.VERSION, store: "UNRELEASED (chưa phát hành CH Play/App Store)" }));
  });

  /* ================= COMMAND OVERVIEW (số liệu từ store thật) ================= */
  app.get("/api/command/overview", Auth.authRequired,
    Auth.requireRole("CEO", "ADMIN", "HOSPITAL_DIRECTOR", "DEPUTY_DIRECTOR", "COMMAND_OPERATOR", "DATA_ANALYST"),
    (req, res) => {
      const { range = "today", building, department } = req.query;
      let encs = S.encounters.filter((e) => inRange(e.createdAt, range));
      if (building) encs = encs.filter((e) => e.building === building);
      if (department) encs = encs.filter((e) => normDept(e.department) === normDept(department));
      const c = (st) => encs.filter((e) => e.status === st).length;
      const intake = { received: encs.length, waiting: c("WAITING") + c("REGISTERED"), inExam: c("IN_EXAM"),
        completed: c("COMPLETED"), rejected: c("REJECTED"), referred: c("REFERRED"),
        emergency: c("EMERGENCY"), admitted: c("ADMITTED"), discharged: c("DISCHARGED") };
      const byDept = {};
      for (const e of encs) { const k = e.department; byDept[k] = byDept[k] || { department: k, total: 0, waiting: 0, emergency: 0 }; byDept[k].total++; if (["WAITING", "REGISTERED"].includes(e.status)) byDept[k].waiting++; if (e.status === "EMERGENCY") byDept[k].emergency++; }
      const alerts = O.resources.map((r) => ({ ...r, status: Ops.resourceStatus(r) })).filter((r) => r.status !== "NORMAL")
        .map((r) => ({ id: r.id, name: r.name, qty: r.qty, unit: r.unit, status: r.status,
          priority: r.status === "OUT_OF_STOCK" || r.status === "EXPIRED" ? "CRITICAL" : r.status === "CRITICAL" || r.status === "QUARANTINED" ? "HIGH" : "WARNING",
          owner: r.manager, ref: r.id }));
      const paid = S.payments.filter((p) => p.status === "PAID");
      const finance = { revenue: paid.reduce((s, p) => s + (Number(p.paidAmount ?? p.amount) || 0), 0),
        transactions: S.payments.length, paid: paid.length,
        pending: S.payments.filter((p) => ["UNPAID", "PENDING"].includes(p.status)).length,
        refunded: S.payments.filter((p) => p.status === "REFUNDED").length };
      const now = Date.now();
      const docs = O.documents.map((d) => ({ ...d, computedStatus: d.status !== "DONE" && d.deadline && new Date(d.deadline).getTime() < now ? "OVERDUE" : d.status }));
      const sosOpen = S.sosCases.filter((s) => s.status !== "CLOSED");
      const payload = ok({ source: "live-stores", demo: "DEMO DATA — seed demo, không phải số liệu production",
        range, intake, byDept: Object.values(byDept),
        emergency: { open: sosOpen.length, cases: sosOpen.slice(0, 10) },
        resources: { alerts, low: alerts.filter((a) => a.priority === "WARNING").length,
          high: alerts.filter((a) => a.priority === "HIGH").length, critical: alerts.filter((a) => a.priority === "CRITICAL").length },
        finance, documents: { overdue: docs.filter((d) => d.computedStatus === "OVERDUE").length,
          pendingApproval: docs.filter((d) => d.status === "PENDING_APPROVAL").length, total: docs.length },
        capacity: O.capacity,
        anomaly: { open: O.anomalyCases.filter((x) => x.state === "OPEN").length },
        auditRecent: (ctx.auditTrail || []).slice(0, 10) });
      res.json(payload);
    });

  /* ================= RBAC whoami ================= */
  app.get("/api/rbac/whoami", Auth.authRequired, (req, res) => {
    res.json(ok({ claims: req.user, permissions: Perms2.permsOf(req.user),
      taxonomy: "USER -> JOB TITLE -> ROLE -> PERMISSION -> ORGANIZATION SCOPE -> RESOURCE" }));
  });
};
