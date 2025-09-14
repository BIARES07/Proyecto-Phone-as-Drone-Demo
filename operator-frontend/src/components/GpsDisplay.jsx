import React from 'react';
import './GpsDisplay.css';

const GpsDisplay = ({ position }) => {
  if (!position) {
    return null;
  }

  const formatCoordinate = (coord, type) => {
    if (typeof coord !== 'number') return 'N/A';
    const direction = type === 'lat' ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${Math.abs(coord).toFixed(6)}° ${direction}`;
  };

  return (
    <div className="gps-display-panel">
      <h4>GPS Telemetry</h4>
      <div className="gps-data">
        <p><strong>Lat:</strong> {formatCoordinate(position.lat, 'lat')}</p>
        <p><strong>Lon:</strong> {formatCoordinate(position.lon, 'lon')}</p>
        <p><strong>Alt:</strong> {position.alt ? `${position.alt.toFixed(2)} m` : 'N/A'}</p>
        <p><strong>Accuracy:</strong> {typeof position.accuracy === 'number' ? `±${position.accuracy.toFixed(1)} m` : 'N/A'}</p>
        <p><strong>Speed:</strong> {typeof position.speed === 'number' ? `${position.speed.toFixed(2)} m/s` : 'N/A'}</p>
        <p><strong>Heading Src:</strong> {position.headingSource || (position.heading != null ? 'gps' : 'N/A')}</p>
        <p><strong>Heading:</strong> {position.heading != null ? `${position.heading.toFixed(1)}°` : 'N/A'}</p>
      </div>
    </div>
  );
};

export default GpsDisplay;
