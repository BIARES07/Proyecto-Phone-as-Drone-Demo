import React from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Color } from 'cesium';

const MapView = ({ position }) => {
  return (
    <Viewer full>
      {position && (
        <Entity
          position={Cartesian3.fromDegrees(position.lon, position.lat, position.alt || 0)}
          point={{ pixelSize: 10, color: Color.YELLOW }}
          description={`Lat: ${position.lat}, Lon: ${position.lon}`}
        />
      )}
    </Viewer>
  );
};

export default MapView;
