/**
 * aiTriageEngine — NLP giả lập bằng Keyword Matching tiếng Việt.
 * Chuẩn hóa: lowercase + bỏ dấu để "đau ngực" khớp "dau nguc".
 * Trả về { department, severity, insight } cho Dashboard hiển thị.
 */

function norm(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

const has = (text, ...keys) => keys.some((k) => text.includes(norm(k)));

/**
 * @param {string} text VD: "Bố tôi bị đau thắt ngực khó thở"
 * @returns {{ department: string, severity: "critical"|"medium"|"low", severityLabel: string, insight: string }}
 */
export const analyzeSymptoms = (text = "") => {
  const t = norm(text);

  // 1) TIM MẠCH — Đỏ
  if (has(t, "dau nguc", "that nguc", "nhoi mau", "dot quy", "ngat xiu", "dau tim", "hoi hop", "danh trong nguc", "te tay trai", "lan len vai", "va mo hoi")) {
    return {
      department: "Tim mạch",
      severity: "critical",
      severityLabel: "Đỏ - Khẩn cấp",
      insight: "Có dấu hiệu nhồi máu cơ tim / đột quỵ. Đề xuất: chuẩn bị máy sốc tim, ECG, máy chụp CT và báo động Đội Can thiệp Tim mạch.",
    };
  }
  // 2) CHẤN THƯƠNG — Đỏ
  if (has(t, "gay", "chan thuong", "chay mau", "tai nan", "tngt", "nga cao", "dap", "vo xuong", "vet thuong", "mau chay")) {
    return {
      department: "Chấn thương",
      severity: "critical",
      severityLabel: "Đỏ - Khẩn cấp",
      insight: "Chấn thương cấp, nguy cơ shock mất máu. Đề xuất: giữ máu O, chuẩn bị phòng mổ cấp cứu + máy thở + X-quang tại chỗ.",
    };
  }
  // 3) HÔ HẤP — Vàng
  if (has(t, "sot cao", "ho", "kho tho", "tut spo2", "viem phoi", "nghet mui", "dau hong", "covid", "hen suyen")) {
    // khó thở + đau ngực đã bị bắt ở Tim mạch trước; còn lại là Hô hấp
    return {
      department: "Hô hấp",
      severity: "medium",
      severityLabel: "Vàng - Trung bình",
      insight: "Nghi viêm đường hô hấp / viêm phổi. Đề xuất: test nhanh, đo SpO2 liên tục, cách ly tạm và giữ giường Truyền nhiễm.",
    };
  }
  // 4) THẦN KINH — Vàng/Đỏ tùy từ
  if (has(t, "dau dau du doi", "co giat", "dong kinh", "liet", "me man", "hon me", "chong mat", "noi khong ro")) {
    return {
      department: "Thần kinh",
      severity: "medium",
      severityLabel: "Vàng - Trung bình",
      insight: "Dấu hiệu thần kinh cần loại trừ đột quỵ. Đề xuất: thang điểm FAST, CT sọ não sớm, theo dõi tri giác 15 phút/lần.",
    };
  }
  // 5) TIÊU HÓA / SẢN / NHI nhẹ — Xanh
  if (has(t, "dau bung", "tieu chay", "non", "nom", "oi mua", "soc", "di ung", "noi man", "cam cum nhe", "cam lanh")) {
    return {
      department: "Nội tổng hợp",
      severity: "low",
      severityLabel: "Xanh - Nhẹ",
      insight: "Triệu chứng nhẹ, chưa có dấu hiệu sinh tồn nguy kịch. Đề xuất: khám thường quy, bù dịch, theo dõi tại nhà nếu ổn định.",
    };
  }

  // Fallback mặc định — không khớp từ nào
  return {
    department: "Cấp cứu tổng hợp",
    severity: "medium",
    severityLabel: "Vàng - Trung bình",
    insight: "Chưa phân loại được chuyên khoa từ mô tả. Đề xuất: đo sinh tồn (mạch, HA, SpO2), khám sàng lọc cấp cứu rồi phân luồng lại.",
  };
};

export default analyzeSymptoms;
