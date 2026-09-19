# Backup / Recovery — BVĐK TW DEMO1 (§37)

Dữ liệu persistent (không mất khi restart/redeploy nếu disk giữ nguyên):

| Dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| Users (seed 250 + admin tạo) | `backend/data/hospital.db` (SQLite) | Source of truth đăng nhập |
| Encounters/clinical/payments/resources/SOS/notifications/audit | `backend/db.snapshot.json` | Ghi atomic tmp+rename, 15s + sau mỗi mutation |
| Test snapshots | `backend/tests/.test.*` | Tách riêng, không lẫn production |

## Backup

```powershell
Copy-Item backend/data/hospital.db backup/hospital-$(Get-Date -Format yyyyMMdd).db
Copy-Item backend/db.snapshot.json backup/snapshot-$(Get-Date -Format yyyyMMdd).json
```

## Restore

1. Dừng backend.
2. Chép file backup đè về đúng đường dẫn (`DATABASE_URL`, `db.snapshot.json`).
3. Khởi động → `GET /api/ready` phải `connected`.

## Migration / rollback

- Schema SQLite: `CREATE TABLE IF NOT EXISTS` nên bản mới mở được DB cũ.
- Rollback: restore 2 file backup trên (không migrate-down phức tạp ở giai đoạn demo).
- Production: đặt DB trên persistent disk (Render Disk/Docker volume), KHÔNG để trên ephemeral FS;
  bật backup định kỳ + `ALLOW_DEMO_SEED` trống + `NODE_ENV=production`.
