import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, Color, HeightReference, Ion, Cesium3DTileset, createOsmBuildingsAsync } from 'cesium';
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

// Modelos 3D personalizados (calles, edificios, 44, piramide, torrehumboldt, concresa)
// han sido descartados en esta restauración. La lógica de POIs y la visualización
// del "dron" simbólico se mantienen sin cambios.

const MapView = ({ position, activePoi, poisMap = new Map() }) => {
  const viewerRef = useRef(null);
  const tilesetRef = useRef(null);
  const [activePoiModels, setActivePoiModels] = useState(new Set());
  const [showBuildings, setShowBuildings] = useState(false);
  // Placeholder config: puedes reemplazar por assetId de Ion o por una URL de tileset.json
  const OSM_BUILDINGS_ASSET_ID = null; // ej: 35858
  const OSM_BUILDINGS_URL = null; // ej: 'https://assets.cesium.com/35858/tileset.json'
  const activePoiTimeouts = useRef(new Map());

  // Establecer token placeholder (para que el usuario lo reemplace).
  // El valor por defecto queda como 'inserta tu token aqui' según lo solicitado.
  useEffect(() => {
    try {
      Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2ZmUzYjBmYy1kOGQ2LTQzN2MtODYzMS0yNGU4MDk4OGM4OTAiLCJpZCI6MzMxMjU1LCJpYXQiOjE3NTgyMzY4Njl9.OHzPAEEJBZIQUc4XcWfszUrrzCAbP38D09RyJ5VG-S4';
    } catch (e) {
      // si Ion no está disponible por alguna razón, no romper la app
    }
  }, []);

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
  // Nota: la representación 3D avanzada del dron fue retirada para simplificar.
  // Se conserva la lógica de POIs, OSM buildings y World Terrain.


  const headingLinePositions = useMemo(() => {
    if (!position || (position.heading == null && !position.prev)) return null;
    const headingVal = (typeof position.heading === 'number') ? position.heading : (position.prev ? computeBearing(position.prev.lat, position.prev.lon, position.lat, position.lon) : null);
    if (headingVal == null) return null;
    const headingRad = CesiumMath.toRadians(headingVal);
    const distanceMeters = 2;
    const metersPerDegLat = 111320;
    const metersPerDegLon = metersPerDegLat * Math.cos(position.lat * Math.PI/180);
    const dLat = (Math.cos(headingRad) * distanceMeters) / metersPerDegLat;
    const dLon = (Math.sin(headingRad) * distanceMeters) / metersPerDegLon;
    const lat2 = position.lat + dLat;
    const lon2 = position.lon + dLon;
    const baseHeight = (typeof position.alt === 'number') ? position.alt : 0;
    return [
      Cartesian3.fromDegrees(position.lon, position.lat, baseHeight),
      Cartesian3.fromDegrees(lon2, lat2, baseHeight)
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

  // Habilitar depthTestAgainstTerrain para que 3D Tiles se recorten correctamente con World Terrain
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    try {
      viewer.scene.globe.depthTestAgainstTerrain = true;
    } catch (e) {
      // No fatal
      // console.warn('[MapView] depthTestAgainstTerrain not available', e);
    }
  }, [viewerRef, terrainProvider]);

  // Efecto para cargar/descargar el tileset de edificaciones OSM cuando showBuildings cambia
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    let mounted = true;

    const removeTileset = () => {
      try {
        if (tilesetRef.current && viewer.scene.primitives.contains && viewer.scene.primitives.contains(tilesetRef.current)) {
          viewer.scene.primitives.remove(tilesetRef.current);
        }
      } catch (e) {
        // ignore
      }
      tilesetRef.current = null;
    };

    const loadTileset = async () => {
      if (!mounted) return;
      // Obtener URL de tileset: preferir URL directa, si no usar Ion assetId
      try {
        // Preferir URL > Ion assetId > Cesium.createOsmBuildingsAsync()
        let tileset = null;
        if (OSM_BUILDINGS_URL) {
          tileset = new Cesium3DTileset({ url: OSM_BUILDINGS_URL });
        } else if (OSM_BUILDINGS_ASSET_ID) {
          // Intentar IonResource desde window.Cesium (si está globalizado)
          if (window.Cesium && window.Cesium.IonResource) {
            const res = await window.Cesium.IonResource.fromAssetId(OSM_BUILDINGS_ASSET_ID);
            const url = res && res.url ? res.url : res;
            tileset = new Cesium3DTileset({ url });
          }
        } else {
          // Varias estrategias para obtener OSM Buildings helper
          if (typeof createOsmBuildingsAsync === 'function') {
            tileset = await createOsmBuildingsAsync();
          } else if (window.Cesium && typeof window.Cesium.createOsmBuildingsAsync === 'function') {
            tileset = await window.Cesium.createOsmBuildingsAsync();
          } else {
            console.warn('[MapView] createOsmBuildingsAsync not available. Provide OSM_BUILDINGS_URL or OSM_BUILDINGS_ASSET_ID, or include the Cesium full build to enable createOsmBuildingsAsync.');
          }
        }

        if (!tileset) {
          console.warn('[MapView] No OSM buildings assetId/URL and createOsmBuildingsAsync not available.');
          setShowBuildings(false);
          return;
        }

        // Ajustes razonables por defecto
        try { tileset.maximumScreenSpaceError = tileset.maximumScreenSpaceError ?? 16; } catch (e) {}
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        // Esperar carga y reportar
        if (tileset.readyPromise) {
          tileset.readyPromise.then(() => {
            if (!mounted) return;
            console.log('[MapView] OSM buildings tileset loaded');
            // Exponer funciones de estilo en window para interacción (como ejemplo)
            try {
              window.osmBuildings = window.osmBuildings || {};
              window.osmBuildings.tileset = tileset;
              window.osmBuildings.colorByMaterial = function colorByMaterial() {
                if (!tileset) return;
                tileset.style = new window.Cesium.Cesium3DTileStyle({
                  defines: { material: "${feature['building:material']}" },
                  color: {
                    conditions: [
                      ["${material} === null", "color('white')"],
                      ["${material} === 'glass'", "color('skyblue', 0.5)"],
                      ["${material} === 'concrete'", "color('grey')"],
                      ["${material} === 'brick'", "color('indianred')"],
                      ["${material} === 'stone'", "color('lightslategrey')"],
                      ["${material} === 'metal'", "color('lightgrey')"],
                      ["${material} === 'steel'", "color('lightsteelblue')"],
                      ["true", "color('white')"]
                    ]
                  }
                });
              };
              window.osmBuildings.highlightAllResidentialBuildings = function highlightAllResidentialBuildings() {
                if (!tileset) return;
                tileset.style = new window.Cesium.Cesium3DTileStyle({
                  color: {
                    conditions: [
                      ["${feature['building']} === 'apartments' || ${feature['building']} === 'residential'", "color('cyan', 0.9)"],
                      ["true", "color('white')"]
                    ]
                  }
                });
              };
              window.osmBuildings.showByBuildingType = function showByBuildingType(buildingType) {
                if (!tileset) return;
                if (buildingType === 'office') {
                  tileset.style = new window.Cesium.Cesium3DTileStyle({ show: "${feature['building']} === 'office'" });
                } else if (buildingType === 'apartments') {
                  tileset.style = new window.Cesium.Cesium3DTileStyle({ show: "${feature['building']} === 'apartments'" });
                }
              };
              window.osmBuildings.colorByDistanceToCoordinate = function colorByDistanceToCoordinate(pickedLatitude, pickedLongitude) {
                if (!tileset) return;
                try {
                  const distanceExpr = "distance(vec2(${feature['cesium#longitude']}, ${feature['cesium#latitude']}), vec2(" + pickedLongitude + "," + pickedLatitude + "))";
                  tileset.style = new window.Cesium.Cesium3DTileStyle({
                    defines: { distance: distanceExpr },
                    color: {
                      conditions: [
                        ["${distance} > 0.014", "color('blue')"],
                        ["${distance} > 0.010", "color('green')"],
                        ["${distance} > 0.006", "color('yellow')"],
                        ["${distance} > 0.0001", "color('red')"],
                        ["true", "color('white')"]
                      ]
                    }
                  });
                } catch (e) {
                  console.warn('[MapView] colorByDistanceToCoordinate failed', e);
                }
              };
            } catch (e) {
              console.warn('[MapView] could not attach style helpers', e);
            }
          }).catch(e => {
            console.error('[MapView] failed to load tileset', e);
          });
        }
      } catch (e) {
        console.error('[MapView] error while loading OSM buildings', e);
      }
    };

    if (showBuildings) {
      if (!tilesetRef.current) loadTileset();
    } else {
      removeTileset();
    }

    return () => { mounted = false; };
  }, [showBuildings, viewerRef, terrainProvider]);

  // cartesianPos usa la altitud reportada por el GPS (si existe) o 0
  const cartesianPos = position ? Cartesian3.fromDegrees(position.lon, position.lat, (typeof position.alt === 'number' ? position.alt : 0)) : undefined;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Floating control moved to bottom-right to avoid overlapping PiP */}
      <div style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 90, background: 'rgba(0,0,0,0.35)', padding: 8, borderRadius: 6 }}>
        <label style={{ color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={showBuildings} onChange={(e) => setShowBuildings(e.target.checked)} />
          Mostrar edificaciones OSM
        </label>
      </div>
      <Viewer
        full
        ref={viewerRef}
        baseLayerPicker={true}
        homeButton={true}
        sceneModePicker={true}
        geocoder={true}
        timeline={true}
        animation={true}
        terrain={terrainProvider}
      >
      {/* Viewer con widgets habilitados para aproximarse al comportamiento del ejemplo `cesium test` */}
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
                heightReference: terrainProvider ? HeightReference.NONE : HeightReference.CLAMP_TO_GROUND
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
              heightReference: terrainProvider ? HeightReference.NONE : HeightReference.CLAMP_TO_GROUND
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
          {/* Dron simbólico 3D removido */}
        </>
      )}

      {/* Renderizar POIs activos como marcadores simples (billboard/point). */}
  {Array.from(poisMap.values()).map(poi => {
        try {
          const id = poi.key || `${poi.name}-${poi.latitude}-${poi.longitude}`;
          const pos = Cartesian3.fromDegrees(poi.longitude || poi.lon || poi.lng || 0, poi.latitude || poi.lat || 0, poi.alt || 0);
          return (
            <Entity
              key={id}
              position={pos}
              name={poi.name}
              description={poi.info || poi.description || ''}
              point={{
                pixelSize: 12,
                color: Color.YELLOW,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                heightReference: HeightReference.CLAMP_TO_GROUND
              }}
            />
          );
        } catch (e) {
          return null;
        }
      })}
      </Viewer>
    </div>
  );
};

export default MapView;
