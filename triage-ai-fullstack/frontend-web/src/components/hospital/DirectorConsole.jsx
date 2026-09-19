import React, { useEffect, useState } from "react";
import { adminSummary, fetchOverview } from "../../services/hospitalApi.js";
import { useAuth } from "../../context/AuthContext.jsx";

/**
 * DIRECTOR CONSOLE (§10): toàn viện + command + khoa + capacity + resource +
 * duyệt theo quyền + nhân sự + audit + anomaly + báo cáo.
 * DIRECTOR ≠ SUPER_ADMIN: không có công cụ kỹ thuật hệ thống ở đây.
 */
export default function DirectorConsole() {
  const { user } = useAuth();
  const [sum, setSum] = useState(null);
  const [ov, setOv] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const isDirector = (user?.hospitalRole === "HOSPITAL_DIRECTOR") || user?.role === "CEO";
  const isSys = user?.hospitalRole === "SUPER_ADMIN";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, o] = await Promise.all([adminSummary(), fetchOverview({ range: "today" })]);
        if (alive) { setSum(s); setOv(o); }
      } catch (e) { if (alive) setErr(e?.response?.data?.error || "Không tải được — cần quyền Giám đốc/HR."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="hosp-card"><p className="hosp-muted">Đang tải Director Console…</p></div>;
  if (err) return <div className="hosp-card"><p className="hosp-err">{err}</p><button className="hosp-btn hosp-btn-ghost mt-2" onClick={() => window.location.reload()}>Thử lại</button></div>;
  if (!sum) return <div className="hosp-card"><p className="hosp-muted">Trống.</p></div>;

  return (
    <div className="space-y-3">
      <div className="hosp-card">
        <p className="hosp-title">DIRECTOR CONSOLE — {isDirector ? "Giám đốc bệnh viện" : (user?.fullName || user?.name || "")}</p>
        <p className="hosp-muted">
          {isSys ? "Bạn đang dùng SUPER_ADMIN (kỹ thuật). " : ""}
          Giám đốc quản trị bệnh viện, không mặc nhiên có quyền kỹ thuật hệ thống (tách SYSTEM ADMIN / HOSPITAL DIRECTOR).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Tổng nhân sự", sum.total], ["Seed", sum.seed], ["Admin tạo", sum.created], ["ACTIVE", sum.byStatus?.ACTIVE || 0],
          ["Ca tiếp nhận hôm nay", ov?.intake?.received ?? "—"], ["Cấp cứu mở", ov?.emergency?.open ?? "—"],
          ["Cảnh báo tài nguyên", ov?.resources?.alerts?.length ?? "—"], ["Văn bản quá hạn", ov?.documents?.overdue ?? "—"]].map(([k, v]) => (
          <div key={k} className="hosp-card text-center"><p className="text-xl font-black">{v}</p><p className="hosp-muted">{k}</p></div>
        ))}
      </div>
      <div className="hosp-card">
        <p className="hosp-title">Nhân sự theo trạng thái</p>
        <p className="hosp-muted">{Object.entries(sum.byStatus || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
      </div>
      <div className="hosp-card">
        <p className="hosp-title">Nhân sự mới nhất (DB: {sum.database})</p>
        {sum.recent?.map((u) => <p key={u.username} className="hosp-muted">{u.fullName} · {u.username} · {u.role} · {u.status}</p>)}
        {(!sum.recent || !sum.recent.length) && <p className="hosp-muted">Trống.</p>}
      </div>
    </div>
  );
}
