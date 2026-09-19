# Triage SOS — Release Notes v1.2.0 (build 12)

Patient/Caregiver Super App — Android APK (DEMO HACKATHON).

## Cài đặt
1. Chép `patient-app-release.apk` vào điện thoại Android (8.0+).
2. Cho phép "Cài đặt ứng dụng không rõ nguồn gốc" khi được hỏi.
3. Mở app → đăng nhập `patient@hospital.demo` / `demo123` (DEMO DATA).

## Kết nối backend
- APK trỏ về backend công khai cấu hình lúc build (xem `build-info.txt`).
- Điện thoại cần Internet. Không dùng tài khoản/khóa production.

## Tính năng chính
- SOS nhấn-giữ 1.2s + GPS + gửi realtime về dashboard bác sĩ.
- Theo dõi trạng thái ca (đã duyệt → điều xe → đang tới → đã tới) + GPS mô phỏng (SIMULATION).
- Lịch hẹn đồng bộ server (merge theo id, offline cache), thuốc theo đơn + điểm danh, Medical ID, AI chat sơ cứu, bệnh viện gần + gọi trực tiếp, thông báo realtime.
- Caregiver: CARE MODE, quyền granular theo scope, thu hồi có hiệu lực ngay.

## Lưu ý demo
- Dữ liệu toàn bộ là DEMO DATA. GPS là SIMULATION.
- AI là rule-based hỗ trợ, không chẩn đoán/kê đơn (AI ASSISTANCE).
- Keystore là key DEMO tự ký — CHƯA PHẢI key phát hành Play Store.
