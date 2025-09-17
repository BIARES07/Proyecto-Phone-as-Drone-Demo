import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, Color, HeightReference, Transforms, HeadingPitchRoll } from 'cesium';

// 1. Modelo Fijo: Componente para tu modelo 'calles.glb' con su posición y rotación hardcodeadas.
const FixedCallesModel = ({ isHighlighted }) => {
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
        color: isHighlighted ? Color.YELLOW.withAlpha(0.5) : Color.WHITE,
        colorBlendMode: isHighlighted ? 1 : 0, // 0=HIGHLIGHT, 1=REPLACE, 2=MIX
        colorBlendAmount: 0.5,
      }}
    />
  );
};

// 1b. Modelo Fijo: Componente para tu modelo 'edificios.glb' con posición y orientación hardcodeadas
const FixedEdificiosModel = ({ isHighlighted }) => {
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
        color: isHighlighted ? Color.YELLOW.withAlpha(0.5) : Color.WHITE,
        colorBlendMode: isHighlighted ? 1 : 0,
        colorBlendAmount: 0.5,
      }}
    />
  );
};

// 1c. Modelo Fijo adicional: '44.glb' con la posición y orientación proporcionadas por el usuario
// Ahora soporta resaltado si su POI está activo (modelId '44').
const FixedModel44 = ({ isHighlighted }) => {
  const position = Cartesian3.fromDegrees(-66.7674174332, 10.1038688942, 0);
  const orientation = Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(
      CesiumMath.toRadians(90),
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0)
    )
  );
  return (
    <Entity
      name="Modelo 44"
      position={position}
      orientation={orientation}
      model={{
        uri: '/44.glb',
        scale: 1,
        color: isHighlighted ? Color.YELLOW.withAlpha(0.5) : Color.WHITE,
        colorBlendMode: isHighlighted ? 1 : 0,
        colorBlendAmount: 0.5,
      }}
    />
  );
};

// 1d. Modelo Fijo adicional: 'piramide.glb' con posición y orientación proporcionadas
// Soporta resaltado si su POI está activo (modelId 'piramide').
const FixedPiramideModel = ({ isHighlighted }) => {
  const position = Cartesian3.fromDegrees(-66.87109488729031, 10.453048860824024, 0);
  const orientation = Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0)
    )
  );
  return (
    <Entity
      name="CC PIRAMIDE"
      position={position}
      orientation={orientation}
      model={{
        uri: '/piramide.glb',
        scale: 2,
        color: isHighlighted ? Color.YELLOW.withAlpha(0.5) : Color.WHITE,
        colorBlendMode: isHighlighted ? 1 : 0,
        colorBlendAmount: 0.5,
      }}
    />
  );
};

// 1e. Modelo Fijo adicional: 'torrehumboldt.glb' con posición y orientación proporcionadas
// Preparado para resaltado futuro (modelId 'torrehumboldt').
const FixedTorreHumboldtModel = ({ isHighlighted }) => {
  const position = Cartesian3.fromDegrees(-66.8714106516617, 10.452183828665106, 0);
  const orientation = Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0)
    )
  );
  return (
    <Entity
      name="TORRE HUMBOLDT"
      position={position}
      orientation={orientation}
      model={{
        uri: '/torrehumboldt.glb',
        scale: 5,
        color: isHighlighted ? Color.YELLOW.withAlpha(0.5) : Color.WHITE,
        colorBlendMode: isHighlighted ? 1 : 0,
        colorBlendAmount: 0.5,
      }}
    />
  );
};

// 1f. Modelo Fijo adicional: 'concresa.glb' con posición y orientación proporcionadas
// Preparado para resaltado futuro (modelId 'concresa').
const FixedConcresaModel = ({ isHighlighted }) => {
  const position = Cartesian3.fromDegrees(-66.87266128901977, 10.451963627694058, 0);
  const orientation = Transforms.headingPitchRollQuaternion(
    position,
    new HeadingPitchRoll(
      CesiumMath.toRadians(56),
      CesiumMath.toRadians(0),
      CesiumMath.toRadians(0)
    )
  );
  return (
    <Entity
      name="CC CONCRESA"
      position={position}
      orientation={orientation}
      model={{
        uri: '/concresa.glb',
        scale: 3,
        color: isHighlighted ? Color.YELLOW.withAlpha(0.5) : Color.WHITE,
        colorBlendMode: isHighlighted ? 1 : 0,
        colorBlendAmount: 0.5,
      }}
    />
  );
};

const MapView = ({ position, activePoi, editableModels = [] }) => {
  const viewerRef = useRef(null);
  const [activePoiModels, setActivePoiModels] = useState(new Set());
  const activePoiTimeouts = useRef(new Map());

  useEffect(() => {
    if (activePoi && activePoi.modelId) {
      const { modelId } = activePoi;

      // Si ya hay un timeout para este POI, lo limpiamos para reiniciarlo
      if (activePoiTimeouts.current.has(modelId)) {
        clearTimeout(activePoiTimeouts.current.get(modelId));
      }

      // Añadimos el modelId al set de modelos activos y actualizamos el estado
      setActivePoiModels(prevModels => {
        if (!prevModels.has(modelId)) {
          const newModels = new Set(prevModels);
          newModels.add(modelId);
          return newModels;
        }
        return prevModels;
      });

      // Creamos un nuevo timeout para eliminar el resalte después de 5 segundos de inactividad
      const timeoutId = setTimeout(() => {
        setActivePoiModels(prevModels => {
          const newModels = new Set(prevModels);
          newModels.delete(modelId);
          return newModels;
        });
        activePoiTimeouts.current.delete(modelId);
      }, 5000); // 5 segundos

      activePoiTimeouts.current.set(modelId, timeoutId);
    }
  }, [activePoi]);


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
      <FixedCallesModel isHighlighted={activePoiModels.has('calles')} />
  <FixedEdificiosModel isHighlighted={activePoiModels.has('edificios')} />
	<FixedModel44 isHighlighted={activePoiModels.has('44')} />
      <FixedPiramideModel isHighlighted={activePoiModels.has('piramide')} />
  <FixedTorreHumboldtModel isHighlighted={activePoiModels.has('torrehumboldt')} />
  <FixedConcresaModel isHighlighted={activePoiModels.has('concresa')} />

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
