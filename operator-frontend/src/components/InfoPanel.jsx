import React from 'react';

const InfoPanel = ({ poi }) => {
  if (!poi) {
    return null;
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '15px',
      borderRadius: '10px',
      maxWidth: '300px',
    }}>
      <h2>{poi.name}</h2>
      <p>{poi.info}</p>
    </div>
  );
};

export default InfoPanel;
