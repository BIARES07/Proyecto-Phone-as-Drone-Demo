import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Math as CesiumMath, Color, HeightReference, Ion, Cesium3DTileset, Cesium3DTileStyle, defined } from 'cesium';

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
  const tilesetRef = useRef(null);
  const tilesetLoadingRef = useRef(false);
  const [tilesetStatus, setTilesetStatus] = useState('idle'); // idle | waiting-viewer | loading | ready | error | hidden
  const [tilesetMessage, setTilesetMessage] = useState('');
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

  // Carga manual con polling para esperar viewer listo
  useEffect(() => {
    if (!showTileset) {
      if (tilesetRef.current) {
        tilesetRef.current.show = false;
        setTilesetStatus('hidden');
      }
      return;
    }

    if (tilesetRef.current) {
      tilesetRef.current.show = true;
      setTilesetStatus('ready');
      return;
    }

    if (tilesetLoadingRef.current) return;
    tilesetLoadingRef.current = true;
    setTilesetStatus('waiting-viewer');
    setTilesetMessage('Esperando inicialización del Viewer...');

    let cancelled = false;
    const startTime = Date.now();

    const attemptLoad = async () => {
      if (cancelled) return;
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer) {
        // Reintentar hasta 5s
        if (Date.now() - startTime > 5000) {
          setTilesetStatus('error');
          setTilesetMessage('Timeout esperando Viewer para cargar modelo.');
          tilesetLoadingRef.current = false;
          console.warn('[Tileset] Timeout esperando viewer');
          return;
        }
        setTimeout(attemptLoad, 200);
        return;
      }

      try {
        setTilesetStatus('loading');
        setTilesetMessage('Cargando modelo 3D...');
        console.log('[Tileset] Cargando (poll) via fromIonAssetId', ASSET_ID_TILESET);
        const tileset = await Cesium3DTileset.fromIonAssetId(ASSET_ID_TILESET);
        if (cancelled) return;
        tilesetRef.current = tileset;
        viewer.scene.primitives.add(tileset);
        await tileset.readyPromise;
        if (cancelled) return;
        console.log('[Tileset] READY radius:', tileset.boundingSphere.radius.toFixed(2));
        const extras = tileset.asset?.extras;
        if (defined(extras) && defined(extras.ion) && defined(extras.ion.defaultStyle)) {
          try {
            tileset.style = new Cesium3DTileStyle(extras.ion.defaultStyle);
            console.log('[Tileset] Estilo default aplicado');
          } catch (e) {
            console.warn('[Tileset] Falló aplicar estilo default', e);
          }
        }
        setTilesetStatus('ready');
        setTilesetMessage('');
        viewer.flyTo(tileset).catch(e => console.warn('[Tileset] flyTo cancelado', e));
      } catch (e) {
        console.error('[Tileset] Error carga (poll)', e);
        setTilesetStatus('error');
        setTilesetMessage('Error cargando modelo (ver consola).');
      } finally {
        tilesetLoadingRef.current = false;
      }
    };

    attemptLoad();

    return () => { cancelled = true; };
  }, [showTileset]);

  const handleFlyTo = useCallback(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && tilesetRef.current) {
      viewer.flyTo(tilesetRef.current).catch(e => console.warn('[Tileset] flyTo cancelado', e));
    } else {
      console.warn('[Tileset] No listo para flyTo');
    }
  }, []);

  return (
    <Viewer full ref={viewerRef}>
      {/* UI flotante simple para controlar visibilidad del tileset */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.55)', padding: '6px 10px', borderRadius: 6, fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center' }}>
        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <input type="checkbox" checked={showTileset} onChange={toggleTileset} style={{ marginRight: 6 }} />
          Modelo 3D (Tileset {ASSET_ID_TILESET})
        </label>
        <button
          onClick={handleFlyTo}
          style={{ marginLeft: 10, background: '#1976d2', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}
        >Ir al modelo</button>
        {tilesetStatus !== 'ready' && tilesetStatus !== 'hidden' && (
          <span style={{ marginLeft: 10, color: '#ffd54f' }}>
            {tilesetMessage || tilesetStatus}
          </span>
        )}
      </div>
      {/* El tileset se gestiona manualmente; no se renderiza componente específico aquí */}
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
