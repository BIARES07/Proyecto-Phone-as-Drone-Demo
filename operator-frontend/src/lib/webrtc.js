// webrtc.js
export const createPeerConnection = (socket, setVideoStream) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  
    peerConnection.ontrack = (event) => {
      setVideoStream(event.streams[0]);
    };
  
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
      }
    };
  
    return peerConnection;
  };
  