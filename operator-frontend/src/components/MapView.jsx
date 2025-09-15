import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Viewer, Entity, Cesium3DTileset } from 'resium';
import { Cartesian3, Math as CesiumMath, Color, HeightReference, Ion, IonResource } from 'cesium';

// Inicializar token Ion (solo una vez). Si no existe variable, loguear advertencia.
if (Ion.defaultAccessToken == null) {
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
  if (token) {
    Ion.defaultAccessToken = token;
  } else {
    // eslint-disable-next-line no-console
    console.warn('[Cesium] Falta VITE_CESIUM_ION_TOKEN; el tileset no se podrá cargar.');
  }
}

const ASSET_ID_TILESET = 3723281; // Modelo 3D Tiles proporcionado

const MapView = ({ position }) => {
  const viewerRef = useRef(null);
  const entityId = 'phone-entity';
  const [showTileset, setShowTileset] = useState(true);
  // La API de geolocalización devuelve el rumbo en grados desde el norte, en sentido horario.
  // Cesium rota en radianes en sentido antihorario desde el este.
  // Convertimos grados a radianes y ajustamos el offset.
  // Ignoramos altitud GPS para visual plana: usamos alt 0 (clamp) para punto y ellipse.
  const cartesianPos = position ? Cartesian3.fromDegrees(position.lon, position.lat, 0) : undefined;

  // Calcular punto de rumbo adelantado (solo si hay heading válido)
  const headingLinePositions = useMemo(() => {
    if (!position || position.heading == null || position.headingSource === 'none') return null;
    // Convertir heading (0 norte horario) a dirección en radianes desde norte
    const headingRad = CesiumMath.toRadians(position.heading);
    const distanceMeters = 2; // longitud de la línea indicadora
    // Aproximaciones: 1 deg lat ~ 111320 m; 1 deg lon ~ 111320 * cos(lat)
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

  // Handler toggle
  const toggleTileset = useCallback(() => setShowTileset(v => !v), []);

  // Diagnóstico: verificar tileset.json cuando se muestra
  useEffect(() => {
    if (!showTileset) return;
    (async () => {
      try {
        console.log('[Tileset Debug] Verificando tileset.json para asset', ASSET_ID_TILESET);
        const resPromise = IonResource.fromAssetId(ASSET_ID_TILESET);
        const resolved = await resPromise; // IonResource es promise-like
        const baseUrl = typeof resolved === 'string' ? resolved : resolved._url;
        console.log('[Tileset Debug] URL base resuelta:', baseUrl);
        const resp = await fetch(baseUrl, { cache: 'no-store' });
        console.log('[Tileset Debug] tileset.json status:', resp.status);
        if (!resp.ok) {
          console.error('[Tileset Debug] tileset.json no OK', resp.status);
        } else {
          const json = await resp.json();
            console.log('[Tileset Debug] Root geometricError:', json.root?.geometricError, 'children:', json.root?.children?.length);
        }
      } catch (e) {
        console.error('[Tileset Debug] Error revisando tileset.json', e);
      }
    })();
  }, [showTileset]);

  return (
    <Viewer full ref={viewerRef}>
      {/* UI flotante simple para controlar visibilidad del tileset */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '6px 10px', borderRadius: 6, fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center' }}>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <input type="checkbox" checked={showTileset} onChange={toggleTileset} style={{ marginRight: 6 }} />
          Modelo 3D (Tileset {ASSET_ID_TILESET})
        </label>
        <button
          onClick={() => {
            const viewer = viewerRef.current?.cesiumElement;
            if (!viewer) return;
            // Intentar localizar tileset entre primitives
            const primitives = viewer.scene.primitives._primitives || [];
            const candidate = primitives.find(p => p.asset?.id === ASSET_ID_TILESET) || primitives.find(p => p._root); // heurística
            if (candidate) {
              viewer.flyTo(candidate).catch(e => console.warn('[Tileset] flyTo cancelado', e));
            } else {
              console.warn('[Tileset] No se encontró tileset para flyTo aún');
            }
          }}
          style={{ marginLeft: 10, background: '#1976d2', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}
        >Ir al modelo</button>
      </div>

      {showTileset && (
        <Cesium3DTileset
          key={ASSET_ID_TILESET}
          url={IonResource.fromAssetId(ASSET_ID_TILESET)}
          maximumScreenSpaceError={8}
          onReady={(tileset) => {
            console.log('[Tileset] READY. BoundingSphere radius:', tileset.boundingSphere.radius.toFixed(2));
            const viewer = viewerRef.current?.cesiumElement;
            if (viewer) {
              viewer.flyTo(tileset).catch(e => console.warn('[Tileset] flyTo cancelado:', e));
            }
          }}
        />
      )}
      {position && (
        <>
          {/* Círculo de precisión */}
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
          {/* Punto central */}
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
          {/* Indicador de rumbo: pequeña línea */}
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
    </Viewer>
  );
};

export default MapView;
