/**
 * mapStyles — Google Maps Dark/Cyberpunk theme.
 * Ẩn POI thừa (nhà hàng, trạm xăng, shop) để nổi đường phố + bệnh viện.
 * Gắn vào <GoogleMap options={{ styles: mapStyles }}> (xem ResultView.jsx).
 */
const mapStyles = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  // Ẩn POI không cần thiết
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
  // Đường phố neon
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e293b" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#38bdf8" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#22d3ee" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#0e7490" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#334155" }] },
  // Nước / công viên tối
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#020617" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#134e4a" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#334155" }] },
];

export default mapStyles;
