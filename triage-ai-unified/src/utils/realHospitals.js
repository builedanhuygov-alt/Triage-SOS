/**
 * realHospitals — tọa độ demo quanh trung tâm TP.HCM.
 * Thay lat/lng + tên thật của tỉnh bạn khi đi thi.
 * top1: id "bvdk-trung-tam" (khớp ResultView + Dashboard).
 */
export const userLocation = { lat: 10.762622, lng: 106.660172 };

const realHospitals = [
  {
    id: "bvdk-trung-tam",
    name: "Bệnh viện Đa khoa Trung tâm",
    lat: 10.7743, lng: 106.6669,
    distance: "2.5 km • 5 phút",
    phone: "02838291234",
    status: "open", // open | overload
    specialty: "Tim mạch",
    top1: true,
  },
  {
    id: "bv-quan-x",
    name: "Bệnh viện Quận X",
    lat: 10.7556, lng: 106.6512,
    distance: "1 km • 3 phút",
    phone: "02838551234",
    status: "overload",
    specialty: "Cấp cứu tổng hợp",
    top1: false,
  },
  {
    id: "bv-tim-duc",
    name: "Bệnh viện Tim Đức",
    lat: 10.7831, lng: 106.6762,
    distance: "3.8 km • 9 phút",
    phone: "02839901234",
    status: "open",
    specialty: "Tim mạch",
    top1: false,
  },
];

export default realHospitals;
