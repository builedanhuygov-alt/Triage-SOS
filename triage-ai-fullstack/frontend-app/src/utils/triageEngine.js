/**
 * triageEngine — NLP giả lập (keyword matching tiếng Việt, không dấu).
 * @param {string} text VD: "Bố tôi bị đau thắt ngực khó thở"
 * @returns {{ department, severity: "critical"|"medium"|"low", severityLabel, insight }}
 */
function norm(s = "") {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
const has = (t, ...keys) => keys.some((k) => t.includes(norm(k)));

export function analyzeSymptom(text = "") {
  const t = norm(text);

  if (has(t, "dau nguc", "that nguc", "nhoi mau", "dot quy", "ngat xiu", "dau tim", "te tay trai", "lan len vai", "va mo hoi", "hoi hop"))
    return {
      department: "Tim mạch", severity: "critical", severityLabel: "Đỏ - Khẩn cấp",
      insight: "Có dấu hiệu nhồi máu cơ tim. Đề xuất: chuẩn bị máy sốc tim, ECG và báo Đội Tim mạch.",
    };

  if (has(t, "gay", "chan thuong", "chay mau", "tai nan", "tngt", "nga cao", "vet thuong", "dap"))
    return {
      department: "Chấn thương", severity: "critical", severityLabel: "Đỏ - Khẩn cấp",
      insight: "Chấn thương cấp, nguy cơ shock mất máu. Đề xuất: giữ máu O, phòng mổ cấp cứu sẵn sàng.",
    };

  if (has(t, "sot cao", "ho", "kho tho", "viem phoi", "hen suyen", "tut spo2"))
    return {
      department: "Hô hấp", severity: "medium", severityLabel: "Vàng - Trung bình",
      insight: "Nghi viêm hô hấp/viêm phổi. Đề xuất: SpO2 liên tục, test nhanh, giữ giường Truyền nhiễm.",
    };

  if (has(t, "co giat", "liet", "me man", "hon me", "noi khong ro", "chong mat"))
    return {
      department: "Thần kinh", severity: "medium", severityLabel: "Vàng - Trung bình",
      insight: "Cần loại trừ đột quỵ. Đề xuất: thang FAST, CT sọ não sớm.",
    };

  if (has(t, "dau bung", "tieu chay", "oi mua", "di ung", "cam lanh"))
    return {
      department: "Nội tổng hợp", severity: "low", severityLabel: "Xanh - Nhẹ",
      insight: "Triệu chứng nhẹ. Đề xuất: khám thường quy, theo dõi.",
    };

  return {
    department: "Cấp cứu tổng hợp", severity: "medium", severityLabel: "Vàng - Trung bình",
    insight: "Chưa phân loại được chuyên khoa. Đề xuất: đo sinh tồn rồi phân luồng lại.",
  };
}

export default analyzeSymptom;
