/**
 * realHospitals — mock data sạch cho HospitalMapView (Tab 2).
 * occupancy: % công suất giường ICU. <70 mở | 70–85 sắp quá tải | >=85 quá tải.
 * tier: "central" (tuyến trung ương) | "city" (thành phố).
 */
const realHospitals = [
  {
    id: "choray", name: "Bệnh viện Chợ Rẫy", district: "Quận 5",
    address: "201B Nguyễn Chí Thanh, Q.5, TP.HCM",
    distanceKm: 3.2, eta: "9 phút", phone: "02838554137",
    route: "Nguyễn Chí Thanh",
    occupancy: 92, tier: "central", specialties: ["Hồi sức", "Ngoại tổng hợp"],
    departments: [
      { name: "Cấp cứu", phone: "02838554137" },
      { name: "Hồi sức tích cực", phone: "02838554138" },
      { name: "Ngoại tổng hợp", phone: "02838554139" },
    ],
  },
  {
    id: "115", name: "Bệnh viện Nhân dân 115", district: "Quận 10",
    address: "527 Sư Vạn Hạnh, Q.10, TP.HCM",
    distanceKm: 2.1, eta: "6 phút", phone: "02838654269",
    route: "Sư Vạn Hạnh",
    occupancy: 78, tier: "city", specialties: ["Cấp cứu", "Thần kinh"],
    departments: [
      { name: "Cấp cứu", phone: "02838654269" },
      { name: "Thần kinh", phone: "02838654270" },
      { name: "Tim mạch", phone: "02838654271" },
    ],
  },
  {
    id: "dhyd", name: "Bệnh viện Đại học Y Dược", district: "Quận 5",
    address: "215 Hồng Bàng, Q.5, TP.HCM",
    distanceKm: 4.0, eta: "11 phút", phone: "02839554466",
    route: "Hồng Bàng",
    occupancy: 45, tier: "central", specialties: ["Tim mạch", "Ung bướu"],
    departments: [
      { name: "Tim mạch", phone: "02839554466" },
      { name: "Cấp cứu", phone: "02839554467" },
      { name: "Nhi", phone: "02839554468" },
    ],
  },
  {
    id: "trungtam", name: "Bệnh viện Đa khoa Trung tâm", district: "Quận 1",
    address: "Điểm đến SOS được AI điều phối",
    distanceKm: 2.5, eta: "5 phút", phone: "02838291234",
    route: "Lê Duẩn",
    occupancy: 62, tier: "city", specialties: ["Cấp cứu", "Tim mạch"],
    departments: [
      { name: "Cấp cứu", phone: "02838291234" },
      { name: "Tim mạch", phone: "02838291235" },
      { name: "Chấn thương", phone: "02838291236" },
    ],
  },
  {
    id: "nhidong1", name: "Bệnh viện Nhi Đồng 1", district: "Quận 10",
    address: "341 Sư Vạn Hạnh, Q.10, TP.HCM",
    distanceKm: 2.8, eta: "8 phút", phone: "02839271119",
    route: "Sư Vạn Hạnh",
    occupancy: 71, tier: "central", specialties: ["Nhi khoa", "Cấp cứu nhi"],
    departments: [
      { name: "Cấp cứu nhi", phone: "02839271119" },
      { name: "Nhi tổng hợp", phone: "02839271120" },
    ],
  },
  {
    id: "tudu", name: "Bệnh viện Từ Dũ", district: "Quận 1",
    address: "284 Cống Quỳnh, Q.1, TP.HCM",
    distanceKm: 1.4, eta: "4 phút", phone: "02838344098",
    route: "Cống Quỳnh",
    occupancy: 38, tier: "central", specialties: ["Sản khoa"],
    departments: [
      { name: "Cấp cứu sản", phone: "02838344098" },
      { name: "Sản khoa", phone: "02838344099" },
    ],
  },
];

export const statusOf = (occupancy) =>
  occupancy >= 85 ? "overload" : occupancy >= 70 ? "warning" : "open";

export default realHospitals;
