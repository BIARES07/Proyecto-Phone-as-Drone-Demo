import React from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath } from 'cesium';
import arrow from '/arrow.svg';

const MapView = ({ position }) => {
  // La API de geolocalización devuelve el rumbo en grados desde el norte, en sentido horario.
  // Cesium rota en radianes en sentido antihorario desde el este.
  // Convertimos grados a radianes y ajustamos el offset.
  const headingInRad = position?.heading != null 
    ? CesiumMath.toRadians(-position.heading + 90) 
    : 0;

  return (
    <Viewer full>
      {position && (
        <Entity
          position={Cartesian3.fromDegrees(position.lon, position.lat, position.alt || 0)}
          billboard={{
            image: arrow,
            width: 48,
            height: 48,
            rotation: headingInRad,
          }}
          description={`Lat: ${position.lat.toFixed(6)}, Lon: ${position.lon.toFixed(6)}`}
        />
      )}
    </Viewer>
  );
};

export default MapView;
