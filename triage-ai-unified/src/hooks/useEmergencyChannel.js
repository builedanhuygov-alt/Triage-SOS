import { useEffect } from "react";

const CHANNEL = "emergency_channel";

function beep(freq = 880, duration = 0.35) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = freq; o.type = "sine";
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    o.start(); o.stop(ctx.currentTime + duration);
  } catch {}
}

/** Gửi ca SOS — gọi từ SOS App khi bấm "Báo bệnh viện". */
export function sendEmergencyPatient(data) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: "NEW_PATIENT", data });
    ch.close();
  } catch (e) {
    console.warn("BroadcastChannel không hỗ trợ:", e);
  }
}

/**
 * Lắng nghe ca SOS — dán vào Dashboard.
 * onNewPatient(data) => setPatients(prev => [data, ...prev])
 * Tự phát bíp + trả cleanup đóng channel.
 */
export function useEmergencyListener(onNewPatient, opts = { sound: true }) {
  useEffect(() => {
    let ch;
    try {
      ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (e) => {
        if (e.data?.type === "NEW_PATIENT" && e.data.data) {
          onNewPatient?.(e.data.data);
          if (opts.sound) beep();
        }
      };
    } catch {}
    return () => { try { ch?.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
