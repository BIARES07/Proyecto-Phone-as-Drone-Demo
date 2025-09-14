import React, { useRef, useEffect } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, HeadingPitchRoll, Transforms, Color } from 'cesium';

const MapView = ({ position }) => {
  const viewerRef = useRef(null);
  const entityId = 'phone-entity';
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

  // Hacer que la cámara siga a la entidad una vez que exista.
  useEffect(() => {
    if (viewerRef.current && position) {
      const v = viewerRef.current.cesiumElement;
      if (v && !v.trackedEntity) {
        const ent = v.entities.getById(entityId);
        if (ent) v.trackedEntity = ent;
      }
    }
  }, [position]);

  return (
    <Viewer full ref={viewerRef}>
      {position && (
        <Entity
          id={entityId}
          position={Cartesian3.fromDegrees(position.lon, position.lat, position.alt || 0)}
          orientation={orientation}
          cylinder={{
            length: 8.0,
            topRadius: 0.0,
            bottomRadius: 3.0,
            material: Color.ORANGE.withAlpha(0.9),
            outline: true,
            outlineColor: Color.BLACK
          }}
          description={`Lat: ${position.lat.toFixed(6)}, Lon: ${position.lon.toFixed(6)}${position.accuracy ? ` (±${position.accuracy.toFixed(1)}m)` : ''}`}
        />
      )}
    </Viewer>
  );
};

export default MapView;
