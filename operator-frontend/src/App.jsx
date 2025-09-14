import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import MapView from './components/MapView';
import VideoStream from './components/VideoStream';
import InfoPanel from './components/InfoPanel';
import GpsDisplay from './components/GpsDisplay'; // Importar el nuevo componente
import { createPeerConnection } from './lib/webrtc';
import './App.css';

function App() {
  // --- STATE MANAGEMENT ---
  const [socket, setSocket] = useState(null);
  const [phonePosition, setPhonePosition] = useState(null);
  const [activePOI, setActivePOI] = useState(null);
  const [videoStream, setVideoStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

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
    });

    newSocket.on('gps-from-phone', (data) => {
      setPhonePosition(data);
    });

    newSocket.on('poi-in-range', (poi) => {
      setActivePOI(poi);
    });

    // --- Lógica de WebRTC ---
    newSocket.on('webrtc-offer', async (payload) => {
      console.log('Oferta WebRTC recibida');
      peerConnectionRef.current = createPeerConnection(newSocket, setVideoStream);

      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);

      newSocket.emit('webrtc-answer', { sdp: answer });
    });

    newSocket.on('webrtc-ice-candidate', (payload) => {
      if (peerConnectionRef.current && payload.candidate) {
        console.log('Añadiendo candidato ICE');
        peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    });

    // --- Función de limpieza ---
    return () => {
      console.log('Desconectando socket...');
      newSocket.disconnect();
    };
  }, []); // El array vacío asegura que se ejecute solo una vez

  // --- RENDER ---
  return (
    <div className="app-container">
      <GpsDisplay position={phonePosition} /> {/* Añadir el componente aquí */}
      <div className="video-container">
        <VideoStream stream={videoStream} />
        {!isConnected && <div className="status-overlay">Esperando conexión del teléfono...</div>}
      </div>
      <div className="map-container">
        <MapView position={phonePosition} />
      </div>
      {activePOI && <InfoPanel poi={activePOI} />}
    </div>
  );
}

export default App;

