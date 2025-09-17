import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './ActivePoisPanel.css';

/**
 * Panel lateral que lista POIs activos (dentro de rango recientemente).
 * Props:
 *  - poisMap: Map<string, POIEntry>
 *  - phonePosition: {lat, lon} | null
 *  - onSelect: (poi) => void  (para seguir proporcionando activePOI a MapView)
 *  - ttlMs: number  Tiempo de vida considerado "activo" (solo para mostrarlo en UI, limpieza la hace App)
 */
const ActivePoisPanel = ({ poisMap, phonePosition, onSelect, ttlMs }) => {
  const now = Date.now();
  const [relativeTick, setRelativeTick] = useState(0); // Para refrescar tiempos relativos cada segundo

  useEffect(() => {
    const id = setInterval(() => setRelativeTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Distancia Haversine simple (duplicada para independencia; se podría extraer a util)
  const haversine = (lat1, lon1, lat2, lon2) => {
    if ([lat1, lon1, lat2, lon2].some(v => typeof v !== 'number')) return null;
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const dφ = (lat2 - lat1) * Math.PI/180;
    const dλ = (lon2 - lon1) * Math.PI/180;
    const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const list = useMemo(() => {
    const arr = [];
    if (poisMap) {
      poisMap.forEach((entry) => {
        let distance = null;
        if (phonePosition) {
          distance = haversine(phonePosition.lat, phonePosition.lon, entry.latitude, entry.longitude);
        }
        arr.push({ ...entry, distance });
      });
    }
    // Orden: primero con distancia asc, luego sin distancia; dentro igual distancia, más reciente
    arr.sort((a,b) => {
      if (a.distance == null && b.distance != null) return 1;
      if (a.distance != null && b.distance == null) return -1;
      if (a.distance != null && b.distance != null && a.distance !== b.distance) return a.distance - b.distance;
      return b.lastSeen - a.lastSeen;
    });
    return arr;
  }, [poisMap, phonePosition, relativeTick]);

  const formatMeters = (m) => {
    if (m == null) return '—';
    if (m < 1) return (m*100).toFixed(0) + ' cm';
    if (m < 1000) return m.toFixed(1) + ' m';
    return (m/1000).toFixed(2) + ' km';
  };
  const formatCoord = (val, isLat) => {
    if (typeof val !== 'number') return '—';
    const hemi = isLat ? (val>=0?'N':'S') : (val>=0?'E':'O');
    return Math.abs(val).toFixed(6) + '° ' + hemi;
  };
  const relativeTime = (ts) => {
    const diff = now - ts;
    if (diff < 2000) return 'ahora';
    if (diff < 60000) return Math.floor(diff/1000) + 's';
    const m = Math.floor(diff/60000);
    return m + 'm';
  };

  return (
    <aside className="active-pois-panel">
      <div className="panel-header">
        <h3>POIs Activos <span className="count-badge">{list.length}</span></h3>
        <div className="ttl-hint">TTL {Math.round(ttlMs/1000)}s</div>
      </div>
      {list.length === 0 && (
        <div className="empty">Sin POIs activos</div>
      )}
      <div className="pois-scroll">
        {list.map(poi => {
          const inside = poi.distance != null && poi.distance <= poi.radius;
          const ratio = inside && poi.radius > 0 ? 1 - (poi.distance / poi.radius) : 0;
          const pct = Math.max(0, Math.min(1, ratio));
          const barStyle = {
            width: (pct*100).toFixed(1)+'%',
            background: `linear-gradient(90deg, #2ecc71, #f1c40f ${Math.min(100, pct*130)}%, #e74c3c)`
          };
          return (
            <div key={poi.key} className="poi-card" onClick={() => onSelect && onSelect(poi)}>
              <div className="card-head">
                <div className="title-line">
                  <span className="poi-name">{poi.name}</span>
                  <span className="time-chip" title={new Date(poi.lastSeen).toLocaleTimeString()}>{relativeTime(poi.lastSeen)}</span>
                </div>
                {poi.modelId && <span className="model-tag" title="Modelo asociado">{poi.modelId}</span>}
              </div>
              <div className="poi-info">
                {poi.info && (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{poi.info}</ReactMarkdown>
                )}
              </div>
              <div className="meta-grid">
                <div><label>Lat</label><span>{formatCoord(poi.latitude, true)}</span></div>
                <div><label>Lon</label><span>{formatCoord(poi.longitude, false)}</span></div>
                <div><label>Radio</label><span>{poi.radius} m</span></div>
                <div><label>Dist</label><span>{formatMeters(poi.distance)}</span></div>
                <div><label>Detecciones</label><span>{poi.hits}</span></div>
                <div><label>Primera vez</label><span>{relativeTime(poi.firstSeen)}</span></div>
              </div>
              {inside && (
                <div className="proximity-bar" title={`Dentro del radio: ${(pct*100).toFixed(0)}% proximidad inversa`}>
                  <div className="fill" style={barStyle}></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default ActivePoisPanel;
