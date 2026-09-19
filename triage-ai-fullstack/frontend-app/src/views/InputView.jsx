import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Siren, Mic, MicOff, Search } from "lucide-react";

/** InputView: Apple-clean + Web Speech API thật, sóng âm khi nghe. */
export default function InputView({ symptom, setSymptom, listening, setListening, onSearch }) {
  const recogRef = useRef(null);
  const [error, setError] = useState("");
  const [supported] = useState(
    () => typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  useEffect(() => () => { try { recogRef.current?.abort(); } catch {} }, []);

  const handleMic = () => {
    setError("");
    if (listening) {
      try { recogRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    if (!supported) {
      setError("Trình duyệt không hỗ trợ voice. Đã điền text mẫu — sửa lại rồi bấm Tìm.");
      setSymptom((s) => s || "Bố tôi bị đau thắt ngực, khó thở...");
      return;
    }
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new SR();
      recogRef.current = recog;
      recog.lang = "vi-VN";
      recog.interimResults = true;
      recog.continuous = false;
      let finalText = "";
      recog.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t;
          else interim += t;
        }
        setSymptom((finalText + " " + interim).trim());
      };
      recog.onerror = (e) => {
        const map = {
          "not-allowed": "Bạn chặn quyền Micro. Bấm 🔒 trên thanh địa chỉ để cho phép.",
          "service-not-allowed": "Cần HTTPS/localhost để dùng Micro.",
          "no-speech": "Chưa nghe rõ — nói to, gần mic hơn.",
          "audio-capture": "Không tìm thấy Micro.",
          network: "Lỗi mạng khi nhận diện.",
        };
        setError(map[e.error] || `Lỗi mic: ${e.error}`);
        setListening(false);
      };
      recog.onend = () => setListening(false);
      recog.start();
      setListening(true);
    } catch {
      setError("Không khởi động được Micro. Dùng text mẫu.");
      setSymptom((s) => s || "Đau thắt ngực, khó thở...");
      setListening(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="bg-gradient-to-r from-red-600 to-orange-500 px-5 pb-6 pt-6 text-white">
        <p className="flex items-center gap-2 text-xl font-black tracking-tight"><Siren className="h-6 w-6" /> Cấp Cứu Nhanh</p>
        <p className="text-xs text-white/85">SOS • Nói triệu chứng — AI tự điền</p>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        <textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} autoFocus rows={3}
          placeholder="VD: Bố tôi bị đau thắt ngực, khó thở..."
          className="w-full resize-none rounded-2xl bg-white p-4 text-[15px] tracking-tight shadow-sm ring-1 ring-black/5 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-red-300" />
        <div className="flex flex-col items-center py-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleMic} aria-label={listening ? "Dừng" : "Nhấn để nói"}
            animate={listening ? { scale: [1, 1.14, 1] } : {}} transition={{ repeat: listening ? Infinity : 0, duration: 1.1 }}
            className={`relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl ${listening ? "animate-pulse bg-red-600 shadow-red-600/50" : "bg-gradient-to-br from-red-500 to-orange-500 shadow-red-500/30"}`}>
            {listening && (
              <>
                <motion.span animate={{ scale: [1, 2], opacity: [0.55, 0] }} transition={{ repeat: Infinity, duration: 1.1 }} className="absolute inset-0 rounded-full bg-red-400/50" />
                <motion.span animate={{ scale: [1, 1.6], opacity: [0.4, 0] }} transition={{ repeat: Infinity, duration: 1.1, delay: 0.3 }} className="absolute inset-0 rounded-full bg-orange-400/40" />
              </>
            )}
            {listening ? <MicOff className="relative h-8 w-8" /> : <Mic className="relative h-8 w-8" />}
          </motion.button>
          <p className={`mt-2 text-sm font-bold ${listening ? "animate-pulse text-red-600" : "text-zinc-500"}`}>
            {listening ? "Đang nghe... hãy nói rõ triệu chứng" : "Nhấn để nói"}</p>
          {error && <p className="mt-2 max-w-[300px] rounded-xl bg-red-50 p-2 text-center text-[11px] text-red-600">{error}</p>}
        </div>
      </div>
      <div className="p-4">
        <motion.button whileTap={{ scale: 0.98 }} onClick={onSearch}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-zinc-950 py-4 font-black tracking-tight text-white shadow-xl">
          <Search className="h-5 w-5" /> Tìm bệnh viện phù hợp</motion.button>
      </div>
    </div>
  );
}
