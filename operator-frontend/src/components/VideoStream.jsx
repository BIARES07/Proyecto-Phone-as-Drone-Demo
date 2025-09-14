import React, { useRef, useEffect } from 'react';

const VideoStream = ({ stream }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      console.log('[DBG][VIDEO] Asignado stream al elemento video. Tracks:', stream.getTracks().map(t => t.kind));
      const playPromise = videoRef.current.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          console.log('[DBG][VIDEO] Reproducción iniciada');
        }).catch(err => {
          console.warn('[DBG][VIDEO] Autoplay bloqueado o error al reproducir:', err);
        });
      }
    }
  }, [stream]);

  return <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
};

export default VideoStream;
