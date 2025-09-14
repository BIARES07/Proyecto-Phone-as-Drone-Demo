// webrtc.js
export const createPeerConnection = (socket, setVideoStream, onConnStateChange) => {
  console.log('[DBG][PC] Creando RTCPeerConnection (operador)');
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  const remoteStream = new MediaStream();
  setVideoStream(remoteStream);

  peerConnection.ontrack = (event) => {
    console.log('[DBG][PC] ontrack recibido:', {
      kind: event.track.kind,
      id: event.track.id,
      readyState: event.track.readyState,
      streams: event.streams.map(s => ({ id: s.id, tracks: s.getTracks().map(t => t.kind) }))
    });
    remoteStream.addTrack(event.track);
    console.log('[DBG][PC] remoteStream ahora tiene tracks:', remoteStream.getTracks().map(t => t.kind));
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('[DBG][PC] ICE candidate local generado (operador)');
      socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
    } else {
      console.log('[DBG][PC] Fin de candidatos locales (operador)');
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    console.log('[DBG][PC] ICE connection state:', peerConnection.iceConnectionState);
  };

  peerConnection.onsignalingstatechange = () => {
    console.log('[DBG][PC] Signaling state:', peerConnection.signalingState);
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    console.log('[DBG][PC] Connection state general:', state);
    if (onConnStateChange) onConnStateChange(state);
  };

  return peerConnection;
};
  