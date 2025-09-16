import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import MapView from './components/MapView';
import VideoStream from './components/VideoStream';
import InfoPanel from './components/InfoPanel';
import ActivePoisPanel from './components/ActivePoisPanel';
import GpsDisplay from './components/GpsDisplay';
// Editor de desarrollo: carga dinámica, no incluido en producción
let DevModelEditor;
if (import.meta.env.DEV) {
  DevModelEditor = React.lazy(() => import('./components/DevModelEditor'));
}
import { createPeerConnection } from './lib/webrtc';
import { computeBearing, smoothAngle } from './lib/geo';
import './App.css';
import './components/ModelEditor.css'; // Importar estilos del editor

function App() {
  // --- STATE MANAGEMENT ---
  const [socket, setSocket] = useState(null);
  const [phonePosition, setPhonePosition] = useState(null);
  const [activePOI, setActivePOI] = useState(null);
  const [activePoisMap, setActivePoisMap] = useState(new Map()); // key -> { ..poiData, firstSeen, lastSeen, hits }

  // Config TTL para POIs activos
  const POI_TTL_MS = 10000;
  const PRUNE_INTERVAL_MS = 3000;
  const [videoStream, setVideoStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pipFullscreen, setPipFullscreen] = useState(false);
  const [pipHidden, setPipHidden] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [telemetryLost, setTelemetryLost] = useState(false);
  const lastGpsRef = useRef(null);
  const [rttMs, setRttMs] = useState(null);
  const [pingSeq, setPingSeq] = useState(0);
  const lastFrameTimeRef = useRef(Date.now());
  const [secondsSinceFrame, setSecondsSinceFrame] = useState(0);

  // Estado para los modelos 3D editables (solo en modo desarrollo)
  // Modelos editables solo en desarrollo local
  const [editableModels, setEditableModels] = useState([]);

  const videoContainerRef = useRef(null);
  const dragDataRef = useRef({ dragging:false, offsetX:0, offsetY:0 });


  // Ref para mantener la instancia de RTCPeerConnection
  const peerConnectionRef = useRef(null);

  // --- SIDE EFFECTS ---

  // Efecto para la conexión y eventos de Socket.IO
  useEffect(() => {
    const newSocket = io(import.meta.env.VITE_BACKEND_URL);
    setSocket(newSocket);

    newSocket.emit('register-client', { role: 'OPERATOR' });

    // --- Listeners de Socket.IO ---
    newSocket.on('connect', () => {
      console.log('Conectado al servidor de Socket.IO como Operador.');
    });

    newSocket.on('phone-connected', (payload) => {
      console.log('El teléfono se ha conectado.', payload?.sessionId ? `(sessionId=${payload.sessionId})` : '');
      setIsConnected(true);
    });

    newSocket.on('phone-reconnected', (payload) => {
      console.log('[RECOVERY][OPERATOR] Teléfono reconectado', payload);
      setIsConnected(true);
      // No forzamos recrear PC aquí; esperamos oferta nueva.
    });

    newSocket.on('phone-disconnected', () => {
      console.log('El teléfono se ha desconectado.');
      setIsConnected(false);
      setVideoStream(null); // Limpiar el stream de video
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      setConnectionState('disconnected');
    });

    newSocket.on('gps-from-phone', (data) => {
      try {
        lastGpsRef.current = Date.now();
        const prev = phonePosition;
        let heading = (typeof data.heading === 'number' && !isNaN(data.heading)) ? data.heading : null;
        let headingSource = heading != null ? 'gps' : 'none';

        // Distancia Haversine rápida
        let distanceMeters = 0;
        if (prev) {
          const R = 6371e3;
            const φ1 = prev.lat * Math.PI/180;
            const φ2 = data.lat * Math.PI/180;
            const dφ = (data.lat - prev.lat) * Math.PI/180;
            const dλ = (data.lon - prev.lon) * Math.PI/180;
            const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            distanceMeters = R * c;
        }

        // Fallback: derivar rumbo si no hay heading GPS y nos movimos > 1 m
        if (heading == null && prev && distanceMeters > 1) {
          heading = computeBearing(prev.lat, prev.lon, data.lat, data.lon);
          headingSource = 'derived';
        }

        // Suavizado si teníamos heading previo
        if (heading != null && prev?.heading != null) {
          heading = smoothAngle(prev.heading, heading, 0.35);
        }

        const enriched = { ...data, heading, headingSource, distanceFromPrev: distanceMeters };
        console.log('[DBG][GPS raw]', enriched);
        setPhonePosition(enriched);
      } catch (e) {
        console.warn('[GPS] Error procesando GPS entrante:', e);
        setPhonePosition(data);
      }
    });

    newSocket.on('poi-in-range', (poi) => {
      // Mantener compatibilidad con highlight existente
      setActivePOI(poi);

      setActivePoisMap(prev => {
        const next = new Map(prev);
        const key = poi.name + '|' + poi.latitude + '|' + poi.longitude; // clave simple estable
        const existing = next.get(key);
        const now = Date.now();
        if (existing) {
          next.set(key, { ...existing, ...poi, lastSeen: now, hits: existing.hits + 1 });
        } else {
          next.set(key, { key, ...poi, firstSeen: now, lastSeen: now, hits: 1 });
        }
        return next;
      });
    });

    // --- Lógica de WebRTC ---
    newSocket.on('webrtc-offer', async (payload) => {
      console.log('[DBG][SIGNAL] Oferta WebRTC recibida. Type:', payload?.sdp?.type);
      if (!payload?.sdp?.sdp) {
        console.warn('[DBG][SIGNAL] Oferta sin SDP válida');
        return;
      }
      console.log('[DBG][SDP][OFFER] Primeras 300 chars =>\n', payload.sdp.sdp.slice(0,300));
      // Cerrar PC previa si existía (evita fuga y estados inconsistentes)
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch {}
        peerConnectionRef.current = null;
      }
      peerConnectionRef.current = createPeerConnection(newSocket, setVideoStream, (state)=> setConnectionState(state));

      // Fuerza transceivers para asegurar recepción aun si la oferta marca sendonly
      try {
        peerConnectionRef.current.addTransceiver('video', { direction: 'recvonly' });
        peerConnectionRef.current.addTransceiver('audio', { direction: 'recvonly' });
        console.log('[DBG][PC] Transceivers añadidos (video/audio recvonly)');
      } catch (e) {
        console.warn('[DBG][PC] Error añadiendo transceivers (posible no necesario):', e);
      }

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      console.log('[DBG][PC] RemoteDescription establecida. Contiene m=video?', /m=video/.test(peerConnectionRef.current.remoteDescription.sdp));
      console.log('[DBG][PC] Receivers tras remoteDescription:', peerConnectionRef.current.getReceivers().map(r => ({ kind: r.track?.kind, trackState: r.track?.readyState })));

      const answer = await peerConnectionRef.current.createAnswer();
      console.log('[DBG][SDP][ANSWER] Generada. Primeras 300 chars =>\n', answer.sdp.slice(0,300));
      await peerConnectionRef.current.setLocalDescription(answer);
      console.log('[DBG][PC] LocalDescription establecida.');

      newSocket.emit('webrtc-answer', { sdp: answer });
      console.log('[DBG][SIGNAL] Answer enviada al backend.');
    });

    newSocket.on('webrtc-ice-candidate', (payload) => {
      if (peerConnectionRef.current && payload.candidate) {
        console.log('[DBG][ICE] Añadiendo candidato ICE remoto');
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    });

    // --- Función de limpieza ---
    const keyHandler = (e) => {
      if (e.key === 'v') setPipHidden(h=>!h);
      if (e.key === 'f') setPipFullscreen(f=>!f);
    };
    window.addEventListener('keydown', keyHandler);

    // Interval para purgar POIs expirados
    const pruneId = setInterval(() => {
      setActivePoisMap(prev => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const next = new Map();
        prev.forEach((val, key) => {
          if (now - val.lastSeen <= POI_TTL_MS) {
            next.set(key, val);
          } else {
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, PRUNE_INTERVAL_MS);

    return () => {
      console.log('Desconectando socket...');
      newSocket.disconnect();
      window.removeEventListener('keydown', keyHandler);
      clearInterval(pruneId);
      clearInterval(watchdogId);
      clearInterval(pingIntervalId);
      clearInterval(frameMonitorId);
    };
  }, []); // El array vacío asegura que se ejecute solo una vez

  // Drag handlers
  useEffect(()=>{
    const el = videoContainerRef.current;
    if(!el) return;
    const onDown = (e) => {
      if (e.target.getAttribute('data-drag-exclude') === 'true') return;
      dragDataRef.current.dragging = true;
      const rect = el.getBoundingClientRect();
      dragDataRef.current.offsetX = e.clientX - rect.left;
      dragDataRef.current.offsetY = e.clientY - rect.top;
      el.style.transition='none';
    };
    const onMove = (e) => {
      if(!dragDataRef.current.dragging) return;
      const nx = e.clientX - dragDataRef.current.offsetX;
      const ny = e.clientY - dragDataRef.current.offsetY;
      const maxX = window.innerWidth - el.offsetWidth;
      const maxY = window.innerHeight - el.offsetHeight;
      el.style.left = Math.min(Math.max(0,nx),maxX)+ 'px';
      el.style.top = Math.min(Math.max(0,ny),maxY)+ 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    const onUp = () => { dragDataRef.current.dragging=false; el.style.transition=''; };
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return ()=>{
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [videoContainerRef]);

  // Watchdog Telemetría + Ping RTT + Monitor de frames
  const WATCHDOG_GPS_TIMEOUT_MS = 10000;
  const watchdogId = useRef(null);
  const pingIntervalId = useRef(null);
  const frameMonitorId = useRef(null);

  useEffect(()=>{
    watchdogId.current = setInterval(()=>{
      const last = lastGpsRef.current;
      if (last && Date.now() - last > WATCHDOG_GPS_TIMEOUT_MS) {
        setTelemetryLost(true);
      } else if (last) {
        setTelemetryLost(false);
      }
    }, 2000);

    // Ping RTT usando emit/ack (Socket.IO soporta callback)
    pingIntervalId.current = setInterval(()=>{
      if (!socket) return;
      const seq = pingSeq + 1;
      setPingSeq(seq);
      const start = performance.now();
      socket.timeout(5000).emit('operator-ping', { seq, t: Date.now() }, (err, response) => {
        if (err) return; // timeout u otro
        const rtt = Math.round(performance.now() - start);
        setRttMs(rtt);
      });
    }, 5000);

    // Monitor de frames (si video cambia frames)
    frameMonitorId.current = setInterval(()=>{
      setSecondsSinceFrame(Math.round((Date.now() - lastFrameTimeRef.current)/1000));
    }, 1000);

    return ()=>{
      clearInterval(watchdogId.current);
      clearInterval(pingIntervalId.current);
      clearInterval(frameMonitorId.current);
    };
  }, [socket, pingSeq]);

  // Hook para detectar frames (API experimental requestVideoFrameCallback si existe)
  useEffect(()=>{
    const videoEl = document.querySelector('.video-container video');
    if(!videoEl) return;
    let handle;
    const callback = () => {
      lastFrameTimeRef.current = Date.now();
      if (videoEl.requestVideoFrameCallback) {
        videoEl.requestVideoFrameCallback(callback);
      } else {
        // Fallback: nada, rely en interval monitor
      }
    };
    if (videoEl.requestVideoFrameCallback) {
      videoEl.requestVideoFrameCallback(callback);
    } else {
      // fallback: escuchar playing
      videoEl.addEventListener('timeupdate', callback);
      handle = () => videoEl.removeEventListener('timeupdate', callback);
    }
    return ()=>{ if(handle) handle(); };
  }, [videoStream]);

  const pipClasses = [
    'video-container',
    pipFullscreen ? 'pip-fullscreen':'',
    pipHidden ? 'pip-hidden':'',
    connectionState ? `pc-state-${connectionState}` : ''
  ].filter(Boolean).join(' ');

  const toggleFullscreen = () => setPipFullscreen(f=>!f);
  const toggleHidden = () => setPipHidden(h=>!h);

  // --- RENDER ---
  return (
    <div className="app-container">
      {/* Editor de modelos en desarrollo: React.lazy + Suspense */}
      {import.meta.env.DEV && DevModelEditor && (
        <React.Suspense fallback={null}>
          <DevModelEditor models={editableModels} setModels={setEditableModels} />
        </React.Suspense>
      )}
      <GpsDisplay position={phonePosition} />
      <div className={pipClasses} ref={videoContainerRef}>
        <div className="pip-controls" data-drag-exclude="true">
          <button onClick={toggleHidden} data-drag-exclude="true" title="Mostrar/Ocultar (v)">{pipHidden ? 'Mostrar' : 'Ocultar'}</button>
          <button onClick={toggleFullscreen} data-drag-exclude="true" title="Fullscreen (f)">{pipFullscreen ? 'Normal' : 'Full'}</button>
        </div>
        <VideoStream stream={videoStream} />
        {!isConnected && <div className="status-overlay">Esperando conexión del dispositivo...</div>}
        {telemetryLost && <div className="status-overlay warn">Telemetry Lost (&gt;10s sin GPS)</div>}
        {rttMs != null && <div className="metrics-overlay">RTT {rttMs}ms | Frame silence {secondsSinceFrame}s</div>}
      </div>
      <div className="map-container">
        <MapView position={phonePosition} activePoi={activePOI} editableModels={editableModels} />
      </div>
      {/* Nuevo panel lateral de POIs activos */}
      <ActivePoisPanel
        poisMap={activePoisMap}
        phonePosition={phonePosition}
        onSelect={(poi) => setActivePOI(poi)}
        ttlMs={POI_TTL_MS}
      />
      {/* InfoPanel antiguo (desactivable). Podría eliminarse en un commit posterior */}
      {/* {activePOI && <InfoPanel poi={activePOI} />} */}
    </div>
  );
}

export default App;

