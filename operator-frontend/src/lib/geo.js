// Utilidades geoespaciales para derivar heading y suavizar ángulos
// computeBearing: calcula el rumbo (degrees) desde (lat1,lon1) hasta (lat2,lon2)
// Resultado: 0° = Norte, aumenta en sentido horario [0,360)
export function computeBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * 180 / Math.PI + 360) % 360;
}

// smoothAngle: suaviza transición angular (prev -> current) respetando wrap 360
export function smoothAngle(prev, current, alpha = 0.3) {
  if (prev == null || typeof prev !== 'number') return current;
  let diff = ((current - prev + 540) % 360) - 180; // rango [-180,180)
  return (prev + alpha * diff + 360) % 360;
}
