/**
 * lib/gps — mô phỏng xe cấp cứu tiến về bệnh nhân (GHI RÕ SIMULATION).
 * Dừng khi tới nơi. Mỗi tick phát GPS_LOCATION_UPDATED cho room
 * emergency:{id} + patient:{patientId} và broadcast toàn cục (demo).
 */
const ROUTE = [4.5, 3.8, 3.1, 2.1, 1.2, 0.4]; // km, đúng kịch bản demo
const TICK_MS = 2000;
const timers = new Map();

function etaMinutes(km) {
  return Math.max(1, Math.round((km / 30) * 60));
}

function startSimulation(io, emergency, onArrived) {
  stopSimulation(emergency.id);
  let i = 0;
  const push = () => {
    if (i >= ROUTE.length) {
      stopSimulation(emergency.id);
      const payload = {
        emergencyId: emergency.id, patientId: emergency.patientId || emergency.id,
        distanceKm: 0, etaMinutes: 0, status: "ARRIVED", simulated: true, at: new Date().toISOString(),
      };
      io.to(`emergency:${emergency.id}`).emit("GPS_LOCATION_UPDATED", payload);
      io.to(`patient:${payload.patientId}`).emit("GPS_LOCATION_UPDATED", payload);
      io.emit("GPS_LOCATION_UPDATED", payload);
      onArrived && onArrived();
      return;
    }
    const km = ROUTE[i++];
    const payload = {
      emergencyId: emergency.id, patientId: emergency.patientId || emergency.id,
      distanceKm: km, etaMinutes: etaMinutes(km), status: "EN_ROUTE", simulated: true, at: new Date().toISOString(),
    };
    io.to(`emergency:${emergency.id}`).emit("GPS_LOCATION_UPDATED", payload);
    io.to(`patient:${payload.patientId}`).emit("GPS_LOCATION_UPDATED", payload);
    io.emit("GPS_LOCATION_UPDATED", payload);
  };
  push(); // tick đầu ngay lập tức (4.5 km)
  timers.set(emergency.id, setInterval(push, TICK_MS));
}

function stopSimulation(emergencyId) {
  const t = timers.get(emergencyId);
  if (t) { clearInterval(t); timers.delete(emergencyId); }
}

module.exports = { startSimulation, stopSimulation, ROUTE };
