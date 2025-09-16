import React, { useRef, useEffect, useMemo } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, Color, HeightReference, Transforms, HeadingPitchRoll } from 'cesium';

// 1. Modelo Fijo: Componente para tu modelo 'calles.glb' con su posición y rotación hardcodeadas.
const FixedCallesModel = () => {
  const position = Cartesian3.fromDegrees(-66.767352303, 10.1048760366, 0);
  const orientation = Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(
      CesiumMath.toRadians(91),
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0)
    )
  );

  return (
    <Entity
      name="Calles Model"
      position={position}
      orientation={orientation}
      model={{
        uri: '/calles.glb',
        scale: 1,
      }}
    />
  );
};

// 1b. Modelo Fijo: Componente para tu modelo 'edificios.glb' con posición y orientación hardcodeadas
const FixedEdificiosModel = () => {
  const position = Cartesian3.fromDegrees(-66.7676477673, 10.104852237, 0);
  const orientation = Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(
      CesiumMath.toRadians(89),
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0)
    )
  );
  return (
    <Entity
      name="Edificios Model"
      position={position}
      orientation={orientation}
      model={{
        uri: '/edificios.glb',
        scale: 1,
      }}
    />
  );
};

const MapView = ({ position, editableModels = [] }) => {
  const viewerRef = useRef(null);
  const entityId = 'phone-entity';
  const cartesianPos = position ? Cartesian3.fromDegrees(position.lon, position.lat, 0) : undefined;


  const headingLinePositions = useMemo(() => {
    if (!position || position.heading == null || position.headingSource === 'none') return null;
    const headingRad = CesiumMath.toRadians(position.heading);
    const distanceMeters = 2;
    const metersPerDegLat = 111320;
    const metersPerDegLon = metersPerDegLat * Math.cos(position.lat * Math.PI/180);
    const dLat = (Math.cos(headingRad) * distanceMeters) / metersPerDegLat;
    const dLon = (Math.sin(headingRad) * distanceMeters) / metersPerDegLon;
    const lat2 = position.lat + dLat;
    const lon2 = position.lon + dLon;
    return [
      Cartesian3.fromDegrees(position.lon, position.lat, 0),
      Cartesian3.fromDegrees(lon2, lat2, 0)
    ];
  }, [position]);

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
        <>
          {typeof position.accuracy === 'number' && (
            <Entity
              position={cartesianPos}
              ellipse={{
                semiMajorAxis: Math.max(position.accuracy, 5),
                semiMinorAxis: Math.max(position.accuracy, 5),
                material: Color.CYAN.withAlpha(0.15),
                outline: true,
                outlineColor: Color.CYAN.withAlpha(0.4),
                heightReference: HeightReference.CLAMP_TO_GROUND
              }}
            />
          )}
          <Entity
            id={entityId}
            position={cartesianPos}
            point={{
              pixelSize: 14,
              color: Color.CYAN,
              outlineColor: Color.WHITE,
              outlineWidth: 2,
              heightReference: HeightReference.CLAMP_TO_GROUND
            }}
            description={`Lat: ${position.lat.toFixed(6)}, Lon: ${position.lon.toFixed(6)}${position.accuracy ? ` (±${position.accuracy.toFixed(1)}m)` : ''}`}
          />
          {headingLinePositions && (
            <Entity
              polyline={{
                positions: headingLinePositions,
                width: 4,
                material: Color.YELLOW
              }}
            />
          )}
        </>
      )}

      {/* 2. Render del modelo fijo y los modelos editables */}
      <FixedCallesModel />
      <FixedEdificiosModel />

      {editableModels.map((model) => {
        const position = Cartesian3.fromDegrees(model.lon, model.lat, model.height);
        const orientation = Transforms.headingPitchRollQuaternion(
          position,
          new HeadingPitchRoll(
            CesiumMath.toRadians(model.heading),
            CesiumMath.toRadians(model.pitch),
            CesiumMath.toRadians(model.roll)
          )
        );
        return (
          <Entity
            key={model.id}
            name={model.name}
            position={position}
            orientation={orientation}
            model={{
              uri: model.uri,
              minimumPixelSize: 128,
            }}
          />
        );
      })}
    </Viewer>
  );
};

export default MapView;
