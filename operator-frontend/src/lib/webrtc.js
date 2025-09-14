// webrtc.js
export const createPeerConnection = (socket, setVideoStream) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
  
    const remoteStream = new MediaStream();
    setVideoStream(remoteStream);

    peerConnection.ontrack = (event) => {
      remoteStream.addTrack(event.track, remoteStream);
    };
  
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
      }
    };
  
    return peerConnection;
  };
  