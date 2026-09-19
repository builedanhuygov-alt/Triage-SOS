# BVĐK TW DEMO1 RELEASE — V2 FINAL (2026-09-19)

> Đợt MASTER (host + DB + user management): xem thêm mục MASTER bên dưới.

> Quy tắc trung thực: chỉ ghi PUBLISHED/BUILT/CONNECTED khi đã verify thật.
> ADAPTER READY / DEMO / SIMULATED / BLOCKED dùng đúng nơi đúng chỗ.

## Trạng thái tổng

```text
Backend:                 PASS (audit 21/21 + fix 9 lỗi gốc)
Health:                  PASS (/api/health + /api/health/dependencies)
RBAC:                    PASS (11 vai + 8 case §IX)
Clinical:                PASS (journey 9 chặng end-to-end)
Payment:                 PASS (QR + CASH + idempotency + guard)
Resource:                PASS (2 cấp + concurrency exactly-once)
SOS:                     PASS (lifecycle + idempotent + socket auth)
Patient App:             PASS (web/PWA + APK + AAB mới build)
Hospital Web:            PASS (build + publish)
Build:                   PASS
Publish Hospital Web:    PUBLISHED https://triage-command-center.vercel.app
Publish Patient Web:     PUBLISHED https://triage-sos-app.vercel.app
Android:                 BUILT (APK + AAB, keystore DEMO — KHÔNG phải key Play Store)
iOS:                     BLOCKED (no macOS/Xcode toolchain; chạy `npx cap add ios` trên Mac để chuẩn bị)
Legacy Tests:            45/45
V2 Tests:                11/11
Release Tests:           8/8 (mới)
Integration:             PASS (HTTP + socket thật, multi-process)
E2E:                     N/A (no Playwright/Cypress in repo — không thêm framework cho đẹp báo cáo)
```

## Backend errors fixed (ERROR → ROOT CAUSE → FIX)

1. `/api/health` thiếu schema → chuẩn mới `{status, service, version, environment, timestamp}` + `/api/health/dependencies` (payment/bhyt/map = SIMULATED, không fake CONNECTED).
2. Error format rời rạc → envelope cộng thêm `{code, requestId}` (giữ `{success,data,error}` legacy) + server log requestId/method/route/user/status.
3. Snapshot ghi đè trực tiếp (crash = corrupt = mất data) → atomic tmp+rename trong `persistence.js`.
4. `POST /payments/:id/confirm` cho phép confirm lại đổi method → 409 khi đã PAID (refund flow riêng) + `Idempotency-Key` replay đúng response gốc.
5. `POST /api/sos` gửi lại tạo 2 case → `Idempotency-Key` (replay trả 201 gốc + flag `replayed`).
6. Socket `JOIN` mở (Patient A vào room Patient B) → verify ownership (patientId/grant/staff), `JOIN_DENIED` + audit.
7. Không rate limit → login 120/phút/IP, SOS 30/phút/IP (429 + code RATE_LIMITED).
8. Production tự seed demo → gate `NODE_ENV=production && ALLOW_DEMO_SEED!=1` tắt seed (DEMO ≠ PROD).
9. Taxonomy thiếu `BHYT_VERIFY` cho tiếp nhận/trưởng khoa → bổ sung đúng vai (BS giữ phạm vi chuyên môn).

## Tích hợp ngoài (trung thực)

```text
BHYT API:          ADAPTER READY (xác minh thủ công, SIMULATED)
Google Maps:       ADAPTER READY (haversine + ETA minh họa, SIMULATED)
Payment gateway:   SIMULATED (QR/biên nhận nội bộ)
SMS / 115 API:     SIMULATED (SOS công khai + nút gọi 115)
Backend staging:   BLOCKED — https://triage-backend.onrender.com 503 (chưa deploy),
                   tunnel cũ đã chết. Web deployed hiện không tới được API production.
```

## Artifacts (đường dẫn thật)

```text
triage-ai-fullstack/release/hospital-web/          (dist Hospital Web, bundle staging URL, no localhost)
triage-ai-fullstack/release/patient-web/           (dist Patient PWA: manifest + sw.js + icons)
triage-ai-fullstack/release/patient-app-release.apk (3.427.846 bytes, build 2026-09-19, apksigner V2 OK)
triage-ai-fullstack/release/patient-app-release.aab (3.218.930 bytes, build 2026-09-19)
triage-ai-fullstack/release/demo-hospital-accounts.xlsx (14 sheets, 247 accounts)
```

## Verify sau publish (HTTP thật)

```text
200 https://triage-command-center.vercel.app/
200 https://triage-sos-app.vercel.app/
200 https://triage-sos-app.vercel.app/manifest.webmanifest
200 https://triage-sos-app.vercel.app/sw.js
Login/API sau publish: BLOCKED (thiếu backend production — cần Render deploy; không fake)
```

## Known limitations

- CORS `*` (demo/staging); production cần allowlist.
- Idempotency cache in-memory (restart mất); snapshot là JSON file (không phải DB production).
- Keystore `triage-release.keystore` là key DEMO tự ký đã commit từ trước — KHÔNG dùng phát hành Store.
- `triage-ai-unified/` và `hospital-command-center/` không đụng tới đợt này.
- Dashboard `/api/dashboard` legacy giữ seed tĩnh để tương thích (Command Center mới dùng `/api/command/overview` live).

---

# MASTER — HOST + DATABASE + USER MANAGEMENT (2026-09-19)

- Users: 250 seed (INITIAL SEED, khớp Excel screenshot + 3 TK mới) + admin-created, SQLite persistent.
- User Management API: create→INVITED→accept→ACTIVE, scrypt hash, SUSPEND/DISABLE (no hard-delete).
- Auth: SQLite-first + legacy fallback. DIRECTOR ≠ SUPER_ADMIN (console tách bạch).
- Tests: 73/73 (45 legacy + 11 v2 + 8 release + 9 usermgmt).
- Smoke E2E local: 19/19.
- Hospital Web: PUBLISHED https://triage-command-center.vercel.app (200).
- Patient Web: PUBLISHED https://triage-sos-app.vercel.app (200).
- Backend/API/DB production: BLOCKED (chưa có host Node/DB credentials) — chạy local OK.
- v0.dev: BLOCKED (no access) — UI làm thủ công theo design tokens, không fake.
- APK/AAB mới: KHÔNG build đợt này (giữ artifact V2 trước đó).
- External: BHYT/Maps/115/Payment/SMS/Health/Email = ADAPTER READY/SIMULATED.

# PRODUCTION DEPLOY (2026-09-19, đợt Node+SQLite+Socket.io)

- Backend audit 21/21; prod-simulation 13/13; public smoke qua tunnel 20/20 (TEMPORARY).
- Hardening: DATABASE_PATH, AUTH_SECRET fail-fast, CORS allowlist (2 origins, log count),
  trust proxy, security headers, 500/404 JSON không stack trace, rate-limit login/SOS/accept,
  idempotency SQLite persistent, seed-if-empty, engines node>=24, render.yaml Node 24 + disk,
  Dockerfile, .env đầy đủ.
- Public HTTPS (tunnel ẩn danh, session-bound): health/ready/login/whoami/create-doctor/
  scope/RBAC/SOS/socket/Audit 20/20 — URL đã hết hạn sau session (ghi rõ TEMPORARY).
- DB disk: 250 users + created + idem_keys persistent, verified trực tiếp trên file.
- Permanent host: BLOCKED — không có Render/Fly/Railway/VPS/SSH credentials (đã kiểm tra env + CLI).
- Frontend production giữ placeholder staging (không trỏ tunnel đã chết). Không fake ONLINE.

# DEPLOY WEB + APP (2026-09-19, theo yeu cau)
- Hospital Web: PUBLISHED https://triage-command-center.vercel.app (200, deploy moi trong session)
- Patient Web: PUBLISHED https://triage-sos-app.vercel.app (200 + manifest + sw.js 200, deploy moi)
- Backend public: TEMPORARY trycloudflare URL, smoke 20/20 trong session, het han sau session.
- Permanent API host: BLOCKED (chua co credentials) — frontend giu staging placeholder.
