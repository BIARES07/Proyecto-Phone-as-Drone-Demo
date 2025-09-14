// webrtc.js
export const createPeerConnection = (socket, setVideoStream) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  
    peerConnection.ontrack = (event) => {
      const stream = new MediaStream();
      event.streams[0].getTracks().forEach(track => {
        stream.addTrack(track);
      });
      setVideoStream(stream);
    };
  
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
      }
    };
  
    return peerConnection;
  };
  