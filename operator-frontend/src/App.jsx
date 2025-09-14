import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import MapView from './components/MapView';
import VideoStream from './components/VideoStream';
import InfoPanel from './components/InfoPanel';
import GpsDisplay from './components/GpsDisplay'; // Importar el nuevo componente
import { createPeerConnection } from './lib/webrtc';
import { computeBearing, smoothAngle } from './lib/geo';
import './App.css';

function App() {
  // --- STATE MANAGEMENT ---
  const [socket, setSocket] = useState(null);
  const [phonePosition, setPhonePosition] = useState(null);
  const [activePOI, setActivePOI] = useState(null);
  const [videoStream, setVideoStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pipFullscreen, setPipFullscreen] = useState(false);
  const [pipHidden, setPipHidden] = useState(false);
  const [connectionState, setConnectionState] = useState('new');

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

    newSocket.on('phone-connected', () => {
      console.log('El teléfono se ha conectado.');
      setIsConnected(true);
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
      // data: {lat, lon, alt?, heading?, accuracy?, speed?, ts?}
      try {
        const prev = phonePosition;
        let headingSource = 'gps';
        let heading = (typeof data.heading === 'number') ? data.heading : null;

        if ((heading == null || isNaN(heading)) && prev) {
          // Derivar bearing entre prev y actual si movimiento significativo
            const distLat = Math.abs(data.lat - prev.lat);
            const distLon = Math.abs(data.lon - prev.lon);
            if (distLat > 1e-6 || distLon > 1e-6) { // ~0.11 m escala lat, más en lon según lat
              const derived = computeBearing(prev.lat, prev.lon, data.lat, data.lon);
              headingSource = 'derived';
              heading = derived;
            }
        }

        // Suavizado de heading si tenemos previo con heading calculado
        if (heading != null && prev?.heading != null) {
          heading = smoothAngle(prev.heading, heading, 0.35);
        }

        const enriched = { ...data, heading, headingSource };
        setPhonePosition(enriched);
      } catch (e) {
        console.warn('[GPS] Error procesando GPS entrante:', e);
        setPhonePosition(data); // fallback básico
      }
    });

    newSocket.on('poi-in-range', (poi) => {
      setActivePOI(poi);
    });

    // --- Lógica de WebRTC ---
    newSocket.on('webrtc-offer', async (payload) => {
      console.log('[DBG][SIGNAL] Oferta WebRTC recibida. Type:', payload?.sdp?.type);
      if (!payload?.sdp?.sdp) {
        console.warn('[DBG][SIGNAL] Oferta sin SDP válida');
        return;
      }
      console.log('[DBG][SDP][OFFER] Primeras 300 chars =>\n', payload.sdp.sdp.slice(0,300));
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

    return () => {
      console.log('Desconectando socket...');
      newSocket.disconnect();
      window.removeEventListener('keydown', keyHandler);
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
      <GpsDisplay position={phonePosition} />
      <div className={pipClasses} ref={videoContainerRef}>
        <div className="pip-controls" data-drag-exclude="true">
          <button onClick={toggleHidden} data-drag-exclude="true" title="Mostrar/Ocultar (v)">{pipHidden ? 'Mostrar' : 'Ocultar'}</button>
          <button onClick={toggleFullscreen} data-drag-exclude="true" title="Fullscreen (f)">{pipFullscreen ? 'Normal' : 'Full'}</button>
        </div>
        <VideoStream stream={videoStream} />
        {!isConnected && <div className="status-overlay">Esperando conexión del dispositivo...</div>}
      </div>
      <div className="map-container">
        <MapView position={phonePosition} />
      </div>
      {activePOI && <InfoPanel poi={activePOI} />}
    </div>
  );
}

export default App;

