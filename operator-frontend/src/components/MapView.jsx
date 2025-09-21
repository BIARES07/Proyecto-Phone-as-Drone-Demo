import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, Color, HeightReference, Transforms, HeadingPitchRoll, Ion, UrlTemplateImageryProvider, IonImageryProvider, Matrix4, Quaternion, HeadingPitchRoll as HPR, CallbackProperty, ColorMaterialProperty } from 'cesium';
import { computeBearing } from '../lib/geo';
/**
 * Dron Simbólico (Implementación inicial)
 * --------------------------------------------------------------
 * Objetivo: representar el teléfono como un “dron” 3D sin cargar archivos glTF externos.
 * Estrategia: composición de Entities primitivas (box, ellipse) con offsets ENU.
 * - Cuerpo: box naranja.
 * - Brazos: 4 boxes grises (se colocan a mitad del trayecto hacia la hélice para simular barra completa transversal).
 * - Hélices: discos blancos semitransparentes (blur; no animación por ahora).
 * - Elevación simbólica fija (20m) para dar separación visual del terreno/capas.
 * - Orientación: se usa heading (si disponible) para rotar todo el conjunto.
 * Limitaciones actuales:
 * - No hay jerk smoothing interno en la posición (solo lo que ya hace la capa de heading derivado).
 * - Brazos no rotan individualmente; animación de hélices pendiente (posible future postRender hook).
 * Futuras mejoras previstas:
 * 1) Encapsular en helper buildDroneParts() (Tarea #8) para limpieza.
 * 2) Añadir color dinámico según estado (telemetría perdida, etc.).
 * 3) Migración a glTF inline (data URI) si se requiere malla optimizada y animación.
 * 4) Trail/Path dinámico y escala adaptativa según zoom.
 */
// createWorldImagery & createWorldTerrain pueden no estar tree-shakeados / disponibles según bundler
// Los obtendremos de window.Cesium si existen para evitar TypeError.
const getCesiumFactory = (name) => {
  if (typeof window !== 'undefined' && window.Cesium && typeof window.Cesium[name] === 'function') {
    return window.Cesium[name];
  }
  return undefined;
};
const createWorldImagerySafe = (...args) => {
  const fn = getCesiumFactory('createWorldImagery');
  return fn ? fn(...args) : null;
};
const createWorldTerrainSafe = (...args) => {
  const fn = getCesiumFactory('createWorldTerrain');
  return fn ? fn(...args) : null;
};

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

  // === Base Layers ===
  const initialLayer = () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('map.baseLayer');
      if (stored) return stored;
    }
    return 'OSM';
  };
  const [baseLayerKey, setBaseLayerKey] = useState(initialLayer);
  const [availableKeys, setAvailableKeys] = useState(['OSM','CartoDark']);
  const [layerStatus, setLayerStatus] = useState({}); // key -> 'loading' | 'ready' | 'error'

  // Configurar token Ion si existe
  useEffect(() => {
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token && token !== 'REEMPLAZA_CON_TU_TOKEN') {
      Ion.defaultAccessToken = token;
    }
  }, []);

  // Persistir selección de capa
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('map.baseLayer', baseLayerKey);
    }
  }, [baseLayerKey]);

  // Añadir claves Ion si hay token
  useEffect(() => {
    const token = Ion.defaultAccessToken || import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) {
      setAvailableKeys(k => k.includes('Aerial') ? k : [...k, 'Aerial','Aerial+Labels']);
    }
  }, []);

  // Efecto imperativo: reemplazar capa base con manejo asíncrono seguro (fromAssetId)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const collection = viewer.imageryLayers;
    let cancelled = false;
    // limpiar layers actuales
    for (let i = collection.length - 1; i >= 0; i--) collection.remove(collection.get(i), true);
    setLayerStatus(s => ({...s, [baseLayerKey]: 'loading'}));

    const finishError = (msg, err) => {
      if (cancelled) return;
      if (err) console.warn(msg, err);
      setLayerStatus(s => ({...s, [baseLayerKey]: 'error'}));
    };
    const finishOk = () => {
      if (cancelled) return;
      setLayerStatus(s => ({...s, [baseLayerKey]: 'ready'}));
    };

    const addProvider = (prov) => {
      if (cancelled) return;
      collection.addImageryProvider(prov);
      finishOk();
    };

    (async () => {
      try {
        if (baseLayerKey === 'OSM') {
          return addProvider(new UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap contributors'
          }));
        }
        if (baseLayerKey === 'CartoDark') {
          return addProvider(new UrlTemplateImageryProvider({
            url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            credit: '© Carto'
          }));
        }
        if (baseLayerKey === 'Aerial') {
            const p = await IonImageryProvider.fromAssetId(2);
            return addProvider(p);
        }
        if (baseLayerKey === 'Aerial+Labels') {
            const [base, labels] = await Promise.all([
              IonImageryProvider.fromAssetId(2),
              IonImageryProvider.fromAssetId(3)
            ]);
            if (cancelled) return;
            collection.addImageryProvider(base);
            collection.addImageryProvider(labels);
            return finishOk();
        }
        finishError('[Cesium] Clave de capa desconocida: '+baseLayerKey);
      } catch (err) {
        finishError('[Cesium] Error cargando capa '+baseLayerKey, err);
      }
    })();

    return () => { cancelled = true; };
  }, [baseLayerKey]);

  // Terreno (opcional, requiere token Ion para world terrain)
  const terrainProvider = useMemo(() => {
    try {
      const t = createWorldTerrainSafe();
      return t || undefined;
    } catch (e) {
      return undefined;
    }
  }, []);

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

  // === DRON SIMBÓLICO 3D (Refactor + mejoras) ===
  // Mejores visuales: motores, nariz, línea de altitud, escala dinámica según distancia de cámara.
  const DRONE_ALT_OFFSET_METERS = 20;
  const BASE_BODY_SIZE = 0.55;
  const BASE_ARM_SPAN = 1.1;
  const BASE_ARM_THICKNESS = 0.08;
  const BASE_PROP_RADIUS = 0.38;
  const BASE_MOTOR_HEIGHT = 0.12;
  const BASE_MOTOR_RADIUS = 0.09;
  const NOSE_OFFSET = 0.65; // metros hacia delante para cono/nariz

  // Estado de escala (se actualiza postRender para seguir movimiento de cámara sin forzar demasiados rerenders)
  const [droneScale, setDroneScale] = useState(1);

  // Utilidad: transformar offset ENU
  const computeOffsetPosition = (baseCart, dx, dy, dz = 0) => {
    if (!baseCart) return undefined;
    const enu = Transforms.eastNorthUpToFixedFrame(baseCart);
    const local = new Cartesian3(dx, dy, dz);
    return Matrix4.multiplyByPoint(enu, local, new Cartesian3());
  };

  const droneBasePosition = useMemo(() => {
    if (!position) return undefined;
    return Cartesian3.fromDegrees(position.lon, position.lat, DRONE_ALT_OFFSET_METERS);
  }, [position]);

  // Calcular heading derivado si no está presente
  const derivedHeading = useMemo(() => {
    if (!position) return null;
    if (typeof position.heading === 'number' && !isNaN(position.heading)) return position.heading;
    // Si no hay heading, intentar derivar de movimiento (requiere prevPosition)
    if (position.prev && typeof position.prev.lat === 'number' && typeof position.prev.lon === 'number') {
      const bearing = computeBearing(position.prev.lat, position.prev.lon, position.lat, position.lon);
      return bearing;
    }
    return null;
  }, [position]);

  const droneOrientation = useMemo(() => {
    if (!droneBasePosition) return undefined;
    const headingValue = derivedHeading;
    if (headingValue == null) return undefined;
    const hpr = new HPR(CesiumMath.toRadians(headingValue), 0, 0);
    return Transforms.headingPitchRollQuaternion(droneBasePosition, hpr);
  }, [droneBasePosition, derivedHeading]);

  // Actualizar escala dinámica según distancia cámara-dron (postRender para suavidad)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !droneBasePosition) return;
    const handler = () => {
      const camPos = viewer.camera.position;
      const dist = Cartesian3.distance(camPos, droneBasePosition);
      // Escala empírica: escalado lineal limitado
      const target = Math.min(3, Math.max(0.6, dist / 500));
      // Evitar demasiados renders: sólo actualizar si diferencia > 5%
      setDroneScale(prev => Math.abs(prev - target) > 0.05 ? target : prev);
    };
    viewer.scene.postRender.addEventListener(handler);
    return () => viewer.scene.postRender.removeEventListener(handler);
  }, [droneBasePosition]);

  const propSpinRef = useRef({ t: 0 });

  // Animación hélices: incrementar tiempo en postRender y forzar re-render ligero mediante setState en escala ya existente
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const spinHandler = () => {
      propSpinRef.current.t += viewer.clock.deltaTime; // segundos
    };
    viewer.scene.postRender.addEventListener(spinHandler);
    return () => viewer.scene.postRender.removeEventListener(spinHandler);
  }, []);

  // Construir Entities del dron (memo para minimizar trabajo)
  const droneEntities = useMemo(() => {
    if (!droneBasePosition) return null;
    const ARM_SPAN = BASE_ARM_SPAN * droneScale;
    const BODY_SIZE = BASE_BODY_SIZE * droneScale;
    const ARM_THICKNESS = BASE_ARM_THICKNESS * droneScale;
    const PROP_RADIUS = BASE_PROP_RADIUS * droneScale;
    const MOTOR_H = BASE_MOTOR_HEIGHT * droneScale;
    const MOTOR_R = BASE_MOTOR_RADIUS * droneScale;

    const arms = [
      { key: 'arm-east', dx: ARM_SPAN, dy: 0 },
      { key: 'arm-west', dx: -ARM_SPAN, dy: 0 },
      { key: 'arm-north', dx: 0, dy: ARM_SPAN },
      { key: 'arm-south', dx: 0, dy: -ARM_SPAN },
    ];
    const props = arms.map(a => ({ key: 'prop-' + a.key.split('-')[1], dx: a.dx, dy: a.dy }));
    const motors = props; // coinciden en posición base

    const armEntities = arms.map(a => (
      <Entity
        key={a.key}
        position={computeOffsetPosition(droneBasePosition, a.dx / 2, a.dy / 2, 0)}
        orientation={droneOrientation}
        box={{
          dimensions: new Cartesian3(ARM_SPAN, ARM_THICKNESS, ARM_THICKNESS * 0.9),
          material: Color.DARKGRAY.withAlpha(0.85)
        }}
      />
    ));

    const propEntities = props.map(p => {
      // Propiedades animadas: ejes y alpha. El material debe ser un MaterialProperty; usamos ColorMaterialProperty.
      const colorCallback = new CallbackProperty(() => {
        const t = propSpinRef.current.t * 10;
        const phase = (Math.sin(t + p.dx + p.dy) + 1) / 2;
        const alpha = 0.18 + phase * 0.22;
        return Color.WHITE.withAlpha(alpha);
      }, false);
      const majorProp = new CallbackProperty(() => {
        const t = propSpinRef.current.t * 12;
        return PROP_RADIUS * (1.0 + 0.25 * Math.sin(t + p.dx));
      }, false);
      const minorProp = new CallbackProperty(() => {
        const t = propSpinRef.current.t * 12;
        return PROP_RADIUS * (0.55 + 0.15 * Math.cos(t + p.dy));
      }, false);
      return (
        <Entity
          key={p.key}
          position={computeOffsetPosition(droneBasePosition, p.dx, p.dy, 0.08 * droneScale)}
          orientation={droneOrientation}
          ellipse={{
            semiMajorAxis: majorProp,
            semiMinorAxis: minorProp,
            material: new ColorMaterialProperty(colorCallback)
          }}
        />
      );
    });

    const motorEntities = motors.map(m => (
      <Entity
        key={m.key + '-motor'}
        position={computeOffsetPosition(droneBasePosition, m.dx, m.dy, 0.02 * droneScale)}
        orientation={droneOrientation}
        cylinder={{
          length: MOTOR_H,
          topRadius: MOTOR_R,
          bottomRadius: MOTOR_R,
          material: Color.BLACK.withAlpha(0.9)
        }}
      />
    ));

    // Paleta militar
    const baseGreen = Color.fromBytes(58, 71, 63, 255);
    const panelGreen = Color.fromBytes(93, 111, 100, 255);
    const accentRed = Color.fromBytes(160, 45, 38, 255);

    // Nariz / indicador frontal (acento rojo)
    const noseEntity = (
      <Entity
        key="nose"
        position={computeOffsetPosition(droneBasePosition, NOSE_OFFSET * droneScale, 0, 0)}
        orientation={droneOrientation}
        box={{
          dimensions: new Cartesian3(0.25 * droneScale, 0.12 * droneScale, 0.12 * droneScale),
          material: accentRed.withAlpha(0.9)
        }}
      />
    );

    // Línea de altitud (tether) desde suelo
    const altitudeLine = (
      <Entity
        key="altitude-line"
        polyline={{
          positions: [
            Cartesian3.fromDegrees(position.lon, position.lat, 0),
            droneBasePosition
          ],
          width: 2,
          material: Color.CYAN.withAlpha(0.5)
        }}
      />
    );

    // Cuerpo (color varía si no hay heading)
    const bodyColor = position?.heading == null ? baseGreen.withAlpha(0.55) : baseGreen.withAlpha(0.9);
    const body = (
      <Entity
        key="body"
        position={droneBasePosition}
        orientation={droneOrientation}
        box={{
          dimensions: new Cartesian3(BODY_SIZE, BODY_SIZE, BODY_SIZE * 0.35),
          material: bodyColor,
          outline: true,
          outlineColor: Color.BLACK
        }}
      />
    );

    // Panel superior/acento
    const bodyTop = (
      <Entity
        key="body-top"
        position={computeOffsetPosition(droneBasePosition, 0, 0, (BODY_SIZE * 0.2))}
        orientation={droneOrientation}
        box={{
          dimensions: new Cartesian3(BODY_SIZE * 0.8, BODY_SIZE * 0.8, BODY_SIZE * 0.08),
          material: panelGreen.withAlpha(0.85),
          outline: true,
          outlineColor: Color.BLACK.withAlpha(0.6)
        }}
      />
    );

    return [body, bodyTop, ...armEntities, ...motorEntities, ...propEntities, noseEntity, altitudeLine];
  }, [droneBasePosition, droneOrientation, droneScale, position?.heading]);


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
    <Viewer
      full
      ref={viewerRef}
      baseLayerPicker={false}
      terrain={terrainProvider}
    >
      {/* Selector de capas base */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        zIndex: 200, background: 'rgba(0,0,0,0.55)', padding: '4px 8px', borderRadius: 6,
        fontSize: 12, display: 'flex', gap: 6, backdropFilter: 'blur(4px)'
      }}>
        {availableKeys.map(key => (
          <button
            key={key}
            onClick={() => setBaseLayerKey(key)}
            style={{
              cursor: 'pointer', background: key === baseLayerKey ? '#2ecc71' : '#333',
              color: '#fff', border: '1px solid #555', padding: '2px 6px', borderRadius: 4
            }}
          >{key}</button>
        ))}
        {layerStatus[baseLayerKey] === 'loading' && (
          <span style={{ color: '#ffc' }}>Cargando...</span>
        )}
        {layerStatus[baseLayerKey] === 'error' && (
          <span style={{ color: '#f88' }}>Error capa</span>
        )}
        {['Aerial','Aerial+Labels'].some(k=>availableKeys.includes(k)) === false && (
          <span style={{ color: '#ddd', fontStyle: 'italic' }}>Sin capas Ion (token?)</span>
        )}
      </div>
      {/* Las capas ahora se añaden imperativamente en viewer.imageryLayers */}
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
          {/* Dron simbólico 3D (refactor con mejoras) */}
          {droneEntities}
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
