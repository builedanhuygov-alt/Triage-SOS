/**
 * Bệnh viện tuyến trung ương cho Upward Referral & Escalation.
 * Gọi cấp cứu trực tiếp từng viện qua tel:.
 */
const REFERRAL_HOSPITALS = [
  {
    id: "choray",
    name: "Bệnh viện Chợ Rẫy",
    level: "Tuyến trung ương — hạng đặc biệt",
    strengths: "Hồi sức tích cực, Ngoại thần kinh, ECMO",
    phone: "02838554137",
  },
  {
    id: "bachmai",
    name: "Bệnh viện Bạch Mai",
    level: "Tuyến trung ương — miền Bắc",
    strengths: "Tim mạch can thiệp, Đột quỵ, Chống độc",
    phone: "02438693731",
  },
  {
    id: "vietduc",
    name: "Bệnh viện Việt Đức",
    level: "Tuyến trung ương — ngoại khoa",
    strengths: "Chấn thương chỉnh hình, Ghép tạng, Mổ cấp cứu",
    phone: "02438235353",
  },
];

export const REFER_REASONS = [
  "Vượt quá khả năng chuyên môn",
  "Cần can thiệp tim mạch cao cấp",
  "Cần ECMO / hồi sức chuyên sâu",
  "Cần phẫu thuật thần kinh cấp cứu",
  "Gia đình yêu cầu chuyển tuyến",
];

export default REFERRAL_HOSPITALS;
