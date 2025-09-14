import React from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, HeadingPitchRoll, Transforms } from 'cesium';
import arrow from '/arrow.svg';

const MapView = ({ position }) => {
  // La API de geolocalización devuelve el rumbo en grados desde el norte, en sentido horario.
  // Cesium rota en radianes en sentido antihorario desde el este.
  // Convertimos grados a radianes y ajustamos el offset.
  let orientation = undefined;
  if (position?.heading != null) {
    // Convertimos heading (0 = Norte, horario) a sistema de Cesium (0 = Este, CCW):
    // Heading_Cesium = 90° - heading_geográfico
    const headingCesiumDeg = 90 - position.heading;
    const hpr = new HeadingPitchRoll(CesiumMath.toRadians(headingCesiumDeg), 0, 0);
    const cart = Cartesian3.fromDegrees(position.lon, position.lat, position.alt || 0);
    orientation = Transforms.headingPitchRollQuaternion(cart, hpr);
  }

  return (
    <Viewer full>
      {position && (
        <Entity
          position={Cartesian3.fromDegrees(position.lon, position.lat, position.alt || 0)}
          orientation={orientation}
          billboard={{
            image: arrow,
            width: 48,
            height: 48,
            // Ya no usamos rotation en pantalla; el quaternion fija orientación en el espacio.
          }}
          description={`Lat: ${position.lat.toFixed(6)}, Lon: ${position.lon.toFixed(6)}${position.accuracy ? ` (±${position.accuracy.toFixed(1)}m)` : ''}`}
        />
      )}
    </Viewer>
  );
};

export default MapView;
