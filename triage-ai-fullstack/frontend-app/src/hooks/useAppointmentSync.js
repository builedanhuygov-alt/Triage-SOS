import { useState, useEffect, useCallback } from "react";
import { fetchMyAppointments } from "../services/api.js";
import { socket } from "../services/realtime.js";

const KEY = "triage-appts-server";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

// Merge theo id (không bao giờ duplicate), server thắng khi trùng
function merge(list, incoming) {
  const map = new Map(list.map((a) => [a.id, a]));
  (Array.isArray(incoming) ? incoming : [incoming]).forEach((a) => {
    if (a?.id) map.set(a.id, { ...(map.get(a.id) || {}), ...a });
  });
  return [...map.values()].sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`));
}

/** Đồng bộ lịch hẹn server -> local (online realtime, offline đọc cache). */
export function useAppointmentSync(enabled) {
  const [serverAppts, setServerAppts] = useState(load);
  const [syncedAt, setSyncedAt] = useState(null);

  const pull = useCallback(async () => {
    try {
      const list = await fetchMyAppointments();
      setServerAppts((prev) => {
        const next = merge(prev, list);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      setSyncedAt(new Date());
      return true;
    } catch (e) {
      // Mất quyền (revoke) hoặc logout: xóa cache được bảo vệ, không giữ dữ liệu cũ
      if (e?.response?.status === 401 || e?.response?.status === 403) {
        try {
          localStorage.removeItem(KEY);
          localStorage.removeItem("triage-notifs");
        } catch {}
        setServerAppts([]);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    pull();
    const onUpsert = (a) => {
      if (!a?.id) return;
      setServerAppts((prev) => {
        const next = merge(prev, a);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
      setSyncedAt(new Date());
    };
    const onCancel = ({ id }) => {
      if (!id) return;
      setServerAppts((prev) => {
        const next = prev.filter((a) => a.id !== id);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    };
    socket.on("APPT_CREATED", onUpsert);
    socket.on("APPT_UPDATED", onUpsert);
    socket.on("APPT_CANCELLED", onCancel);
    socket.on("connect", pull);
    return () => {
      socket.off("APPT_CREATED", onUpsert);
      socket.off("APPT_UPDATED", onUpsert);
      socket.off("APPT_CANCELLED", onCancel);
      socket.off("connect", pull);
    };
  }, [enabled, pull]);

  return { serverAppts, syncedAt, pull };
}
