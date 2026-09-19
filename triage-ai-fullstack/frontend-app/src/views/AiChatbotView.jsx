import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, PhoneCall, User, Sparkles, Mic, MicOff, ClipboardCheck, Loader2 } from "lucide-react";
import { analyzeSymptom } from "../utils/triageEngine.js";
import { sendEmergencySignal } from "../services/api.js";
import { readProfile } from "../hooks/useMedicalProfile.js";

const WELCOME =
  "Xin chào, tôi là Trợ lý AI y tế của bạn 💙 Hãy yên tâm — đội ngũ y tế đang đồng hành cùng bạn. Bạn có thể mô tả triệu chứng, hỏi sơ cứu, hoặc nói \"đăng ký khám\" để tôi làm thủ tục từ xa giúp.";

const SAFETY =
  "🛡️ Thông tin mang tính chất định hướng sơ cứu, đội ngũ y tế đang đồng hành cùng bạn. Trường hợp khẩn cấp hãy gọi 115.";

const norm = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const has = (t, ...ks) => ks.some((k) => t.includes(norm(k)));

function topicAnswer(t) {
  if (has(t, "bong", "nuoc soi"))
    return { title: "🔥 Sơ cứu bỏng nước sôi", steps: ["Xả nước mát 15–20 phút, càng sớm càng tốt.", "Tháo đồ chật quanh vùng bỏng, che gạc sạch.", "KHÔNG chọc bóng nước, không bôi kem đánh răng.", "Bỏng rộng/mặt/bàn tay → đi viện ngay."] };
  if (has(t, "dau dau", "nhuc dau"))
    return { title: "🤕 Đau đầu", steps: ["Nghỉ yên tĩnh, uống đủ nước; paracetamol đúng liều.", "Không tự phối nhiều loại giảm đau.", "Đau dữ dội đột ngột/kèm sốt cứng gáy/nôn → đi viện."] };
  if (has(t, "sot", "cam cum"))
    return { title: "🌡️ Sốt", steps: ["≥38.5°C mới hạ sốt bằng paracetamol đúng cân nặng.", "Lau mát, uống oresol.", "Sốt >3 ngày/co giật/khó thở → đi viện."] };
  if (has(t, "dau bung", "tieu chay", "ngo doc", "non", "oi"))
    return { title: "🤢 Tiêu hóa", steps: ["Bù oresol từng ngụm, ăn lỏng.", "Không cầm tiêu chảy khi sốt cao/đi ngoài ra máu.", "Mất nước nặng → đi viện."] };
  return null;
}

/** Parse ý định đăng ký: khoa + nơi chốn + báo người nhà. */
function parseRegistration(q) {
  const t = norm(q);
  if (!has(t, "dang ky", "dat lich", "dat kham", "dang ki")) return null;
  const dept =
    has(t, "tim") ? "Tim mạch" :
    has(t, "chan thuong", "xuong khop", "gay") ? "Chấn thương" :
    has(t, "tieu hoa", "da day", "dau bung") ? "Tiêu hóa" :
    has(t, "than kinh", "dau dau") ? "Thần kinh" :
    has(t, "ho hap", "phoi", "kho tho") ? "Hô hấp" :
    has(t, "nhi") ? "Nhi" :
    has(t, "san", "thai") ? "Sản" : "Cấp cứu";
  const district = (q.match(/Quận\s*\d+|Q\.\s*\d+/i) || [])[0] || "";
  const hospital = has(t, "cho ray") ? "Bệnh viện Chợ Rẫy"
    : has(t, "115") ? "Bệnh viện Nhân dân 115"
    : has(t, "y duoc") ? "Bệnh viện Đại học Y Dược"
    : "Bệnh viện Đa khoa Trung tâm";
  const notifyFamily = has(t, "bao nguoi nha", "bao gia dinh", "goi nguoi nha");
  return { dept, district, hospital, notifyFamily, symptom: q };
}

function mockAnswer(q) {
  const t = norm(q);
  if (has(t, "chao", "hello", "hi") && q.trim().length < 12)
    return `Chào bạn! 👋 Cứ bình tĩnh nhé — hãy mô tả triệu chứng, hỏi sơ cứu, hoặc nói "đăng ký khám khoa Tim mạch" để tôi làm thủ tục giúp.\n\n${SAFETY}`;
  const topic = topicAnswer(t);
  if (topic) return `${topic.title}\n\n${topic.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nBạn đừng lo quá nhé — làm theo từng bước trên, tôi ở đây với bạn. 💙\n\n${SAFETY}`;
  const ai = analyzeSymptom(q);
  // Dấu hiệu nguy kịch -> ưu tiên SOS, KHÔNG chẩn đoán thêm
  if (ai.severity === "critical") {
    return `🚨 Dấu hiệu của bạn có thể NGUY KỊCH — đừng chờ chat!\n\nBấm SOS (giữ 1 giây) ở tab SOS hoặc gọi 115 NGAY. ${ai.insight}\n\nAI ASSISTANCE — Please contact emergency services immediately.\n\n${SAFETY}`;
  }
  return `Tôi nghe bạn rồi — bình tĩnh nhé 💙\n\n[${ai.department} | ${ai.severityLabel}]\n${ai.insight}\n\nAI ASSISTANCE — Please consult your healthcare professional.\n\n${SAFETY}`;
}

const SUGGESTIONS = ["Đăng ký khám khoa Tim mạch gấp", "Bỏng nước sôi phải làm sao?", "Đau bụng dữ dội ở Quận 1, đăng ký giúp tôi"];

/**
 * AiChatbotView — Voice Agent thấu cảm + đăng ký thủ tục từ xa.
 * Phát hiện ý định "đăng ký" -> Pre-Registration Card + mã ưu tiên -> POST.
 */
export default function AiChatbotView() {
  const [msgs, setMsgs] = useState([{ from: "bot", text: WELCOME }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [pendingReg, setPendingReg] = useState(null); // thẻ đăng ký chờ xác nhận
  const [sendingReg, setSendingReg] = useState(false);
  const bottomRef = useRef(null);
  const recogRef = useRef(null);
  const timers = useRef([]);

  const supported = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, typing, pendingReg]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); try { recogRef.current?.abort(); } catch {} }, []);

  // Mic thu âm -> điền thẳng vào input
  const toggleMic = () => {
    if (listening) {
      try { recogRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    if (!supported) {
      setMsgs((m) => [...m, { from: "bot", text: "Thiết bị này chưa hỗ trợ micro — bạn gõ giúp tôi nhé. 🎤" }]);
      return;
    }
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recog = new SR();
      recogRef.current = recog;
      recog.lang = "vi-VN";
      recog.interimResults = false;
      let finalText = "";
      recog.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++)
          if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        if (finalText.trim()) {
          setInput("");
          send(finalText.trim()); // nói xong tự gửi luôn cho nhanh
        }
      };
      recog.onerror = () => setListening(false);
      recog.onend = () => setListening(false);
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const send = (text) => {
    const q = (text ?? input).trim();
    if (!q || typing) return;
    setMsgs((m) => [...m, { from: "user", text: q }]);
    setInput("");
    // Ưu tiên 1: ý định đăng ký -> thẻ xác nhận
    const reg = parseRegistration(q);
    if (reg) {
      setTyping(true);
      timers.current.push(setTimeout(() => {
        setTyping(false);
        setPendingReg({
          ...reg,
          code: `UT-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          eta: "15–20 phút",
        });
        setMsgs((m) => [...m, { from: "bot", text: `Rõ rồi! Tôi đã điền sẵn thủ tục cho bạn — kiểm tra thẻ bên dưới và bấm xác nhận nhé ✅\n\n${SAFETY}` }]);
      }, 900));
      return;
    }
    // Ưu tiên 2: tư vấn thường
    setTyping(true);
    const wait = Math.min(900 + q.length * 18, 2400);
    timers.current.push(setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { from: "bot", text: mockAnswer(q) }]);
    }, wait));
  };

  // Xác nhận thẻ đăng ký -> POST /api/emergency
  const confirmReg = async () => {
    if (!pendingReg || sendingReg) return;
    setSendingReg(true);
    try {
      const p = readProfile();
      const created = await sendEmergencySignal({
        symptom: `Đăng ký từ xa qua AI: ${pendingReg.symptom}`,
        severity: "medium",
        department: pendingReg.dept,
        aiInsight: `[${pendingReg.dept} | Đăng ký trước] BN đặt trước ${pendingReg.hospital}${pendingReg.district ? ` (${pendingReg.district})` : ""}. Mã ưu tiên ${pendingReg.code}.`,
        eta: pendingReg.eta,
        hr: null, spo2: null,
        bloodType: p.bloodType || "", conditions: p.conditions || [],
        emergencyContact: { name: p.contactName || "", phone: p.contactPhone || "" },
        priorityCode: pendingReg.code, source: "chat-agent",
        registration: pendingReg,
      });
      setMsgs((m) => [...m, {
        from: "bot",
        text: `🎉 Xong! Viện đã nhận đăng ký ${created?.id || ""} — mã ưu tiên ${pendingReg.code}.\nDự kiến tiếp nhận sau ${pendingReg.eta}. ${pendingReg.notifyFamily && p.contactPhone ? `Đã báo người nhà ${p.contactPhone}.` : "Nhớ báo người nhà đi cùng nhé."}\n\n${SAFETY}`,
      }]);
      setPendingReg(null);
    } catch {
      setMsgs((m) => [...m, { from: "bot", text: "Chưa gửi được (backend offline?). Bạn thử lại giúp tôi nhé." }]);
    } finally {
      setSendingReg(false);
    }
  };

  return (
    <div className="flex h-full flex-col pt-5">
      <div className="mx-4 flex items-center gap-2.5 rounded-2xl bg-white/90 p-3 ring-1 ring-zinc-200 backdrop-blur-md">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight text-zinc-900">Trợ lý AI Triage 🎙️</p>
          <p className="flex items-center gap-1 text-[11px] text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Thấu cảm • Đặt khám bằng giọng nói
          </p>
        </div>
        <motion.a whileTap={{ scale: 0.9 }} href="tel:115"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow">
          <PhoneCall className="h-4 w-4" />
        </motion.a>
      </div>

      <div className="mt-2 flex-1 space-y-2.5 overflow-y-auto px-4 pb-2">
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div key={i} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={`flex items-end gap-1.5 ${m.from === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${
                m.from === "user" ? "bg-zinc-900" : "bg-gradient-to-br from-violet-600 to-fuchsia-500"}`}>
                {m.from === "user" ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              </span>
              <div className={`max-w-[80%] whitespace-pre-line rounded-3xl p-3 text-[13px] leading-relaxed shadow-sm ${
                m.from === "user" ? "rounded-br-lg bg-zinc-900 text-white" : "rounded-bl-lg bg-white/90 text-zinc-800 ring-1 ring-zinc-200 backdrop-blur-md"
              }`}>
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {typing && (
          <div className="flex items-end gap-1.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="flex gap-1 rounded-3xl rounded-bl-lg bg-white/90 p-3.5 ring-1 ring-zinc-200">
              {[0, 1, 2].map((d) => (
                <motion.span key={d} className="h-2 w-2 rounded-full bg-zinc-400"
                  animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1, delay: d * 0.18 }} />
              ))}
            </div>
          </div>
        )}

        {/* Thẻ xác nhận đăng ký từ xa */}
        <AnimatePresence>
          {pendingReg && (
            <motion.div initial={{ y: 24, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-500 p-4 text-white shadow-xl">
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-white/80">
                <ClipboardCheck className="h-4 w-4" /> Thẻ xác nhận đăng ký
              </p>
              <p className="mt-1.5 font-mono text-2xl font-black tracking-widest">{pendingReg.code}</p>
              <div className="mt-1.5 space-y-0.5 text-[13px]">
                <p><b>Khoa:</b> {pendingReg.dept}</p>
                <p><b>Viện:</b> {pendingReg.hospital}</p>
                {pendingReg.district && <p><b>Khu vực:</b> {pendingReg.district}</p>}
                <p><b>Dự kiến tiếp nhận:</b> {pendingReg.eta}</p>
                {pendingReg.notifyFamily && <p>📞 Sẽ báo người nhà khi bạn xác nhận</p>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setPendingReg(null)}
                  className="rounded-full bg-white/20 py-2.5 text-xs font-black">Sửa lại</button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={confirmReg} disabled={sendingReg}
                  className="rounded-full bg-white py-2.5 text-xs font-black text-violet-700 disabled:opacity-60">
                  {sendingReg ? "Đang gửi..." : "Xác nhận gửi đến viện"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)}
            className="shrink-0 rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-100">
            {s}
          </button>
        ))}
      </div>

      {/* Input bar + Mic sóng âm */}
      <div className="flex items-center gap-2 px-4 pb-28">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Nói hoặc gõ: đăng ký khám..."
          className="min-w-0 flex-1 rounded-full bg-white/90 p-3 text-sm ring-1 ring-zinc-200 backdrop-blur-md outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-violet-300"
        />
        <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMic} aria-label="Thu âm"
          animate={listening ? { scale: [1, 1.12, 1] } : {}} transition={{ repeat: listening ? Infinity : 0, duration: 1.1 }}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow ${
            listening ? "animate-pulse bg-red-600" : "bg-gradient-to-br from-fuchsia-500 to-violet-600"}`}>
          {listening && (
            <motion.span animate={{ scale: [1, 1.7], opacity: [0.5, 0] }} transition={{ repeat: Infinity, duration: 1.1 }}
              className="absolute inset-0 rounded-full bg-fuchsia-400/50" />
          )}
          {listening ? <MicOff className="relative h-4 w-4" /> : <Mic className="relative h-4 w-4" />}
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => send()} disabled={!input.trim() || typing}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow disabled:opacity-40">
          <Send className="h-4 w-4" />
        </motion.button>
      </div>
    </div>
  );
}
