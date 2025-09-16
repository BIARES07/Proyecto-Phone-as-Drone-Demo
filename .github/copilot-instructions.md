# Instrucciones para Agentes de IA
Resumen vivo de arquitectura y convenciones del proyecto Phone-as-Drone Demo. Mantener conciso (<50 líneas efectivas) y actualizar cuando cambie señalización, eventos o estructura.

## 1. Arquitectura
1) `backend/` (Node + Express + Socket.IO) señaliza WebRTC, reemite GPS, detecta POIs, sirve `phone-app/` bajo `/phone`. Estado en memoria: `connectedClients`, `pointsOfInterest` (reinicios limpian).
2) `phone-app/` (HTML/JS vanilla) captura cámara+micrófono, GPS, oferta WebRTC, emite `gps-update`, incluye consola embebida (limite 500 logs, toggle Mostrar/Ocultar).
3) `operator-frontend/` (React + Vite + Cesium/Resium + `vite-plugin-cesium`) recibe video, telemetría, POIs; UI con ventana de video PIP draggable, atajos teclado: v (oculta/muestra), f (fullscreen).

## 2. Flujo Core
Registro: PHONE -> `register-client` guarda `phoneSocketId`; OPERATOR -> entra a `operator-room` y recibe `phone-connected` si aplica.
GPS: PHONE -> `gps-update` (con `heading`) => broadcast `gps-from-phone`; si dentro de radio POI => `poi-in-range`.
WebRTC: PHONE crea `webrtc-offer` -> operadores; operador crea `webrtc-answer` -> teléfono. ICE: cada lado -> backend -> lado opuesto (`operator-room` / `phone-room`). Al desconectar teléfono => `phone-disconnected` y operador limpia PeerConnection.

## 3. Eventos Socket.IO
Cliente→Servidor: `register-client {role:'PHONE'|'OPERATOR'}` | `gps-update {lat,lon,alt?,heading?}` | `webrtc-offer {sdp}` | `webrtc-answer {sdp}` (solo operador) | `webrtc-ice-candidate {candidate}`.
Servidor→Operador: `phone-connected` | `phone-disconnected` | `gps-from-phone {lat,lon,alt?,heading?}` | `poi-in-range {name,latitude,longitude,radius,info}` | `webrtc-offer {sdp}` | `webrtc-ice-candidate {candidate}`.
Servidor→Teléfono: `webrtc-answer {sdp}` | `webrtc-ice-candidate {candidate}`.

## 4. WebRTC Detalles
1 PeerConnection por sesión. STUN único `stun:stun.l.google.com:19302` (sin TURN). Operador, al recibir oferta, fuerza `addTransceiver('video','recvonly')` y `audio` para garantizar recepción aun si SDP llega `sendonly`. Solo media (sin DataChannel). Añadir datos => crear `dataChannel` en teléfono + `ondatachannel` en operador y documentar aquí.

## 5. POIs
Fuente: `backend/data/pointsOfInterest.json`. Distancia: Haversine `getDistance` (R=6371e3 m). Editar JSON + reiniciar para cambios. Evento `poi-in-range` se dispara cada actualización de GPS dentro del radio (no se hace supresión de duplicados: manejar en UI si se añade lógica futura).

## 6. Configuración
Backend puerto `PORT` (def 3001). Logs prefijos: `[INIT] [CONNECTION] [REGISTER] [GPS] [POI] [WebRTC] [DISCONNECT] [ERROR]` para grep. Operador requiere `.env` con `VITE_BACKEND_URL`. Teléfono usa constante `SERVER_URL` (actualmente apunta a despliegue Render); recordar ajustar en local. Falta script `start` en `backend/package.json` (opcional agregar). Cesium necesita permisos de red en build; el plugin ya configurado en Vite.

## 7. Convenciones y Rooms
Rooms: `'phone-room'` (el teléfono), `'operator-room'` (todos operadores). Validación defensiva de payloads (tipos numéricos en GPS, rol en registro). Advertencia multi-teléfono: si llega otro PHONE se sobrescribe `phoneSocketId` y se loguea warning (no soportado formalmente aún). Mantener estado simple sin singletons externos.

## 8. UI / UX Operador
Ventana PIP draggable (mouse down excepto controles). Estados WebRTC reflejados en clases `pc-state-*`. Panel `GpsDisplay` formatea lat/lon con hemisferios.

### Panel de POIs Activos (Nuevo)
Reemplaza al antiguo `InfoPanel` único. Ahora se mantiene un `Map` en memoria en el frontend con POIs "activos" (último evento `poi-in-range` dentro de un TTL).

- Componente: `ActivePoisPanel` (lateral derecho, scrollable).
- Al recibir `poi-in-range` se actualiza/crea entrada: `{ name, info, latitude, longitude, radius, modelId?, firstSeen, lastSeen, hits }`.
- TTL configurable (actual 10s). Limpieza por intervalo (3s) elimina entradas expiradas (`now - lastSeen > TTL`).
- Orden de visualización: distancia ascendente (si calculable) y luego más recientes.
- Cada card muestra: nombre, tiempo relativo (`lastSeen`), info, lat, lon, radio, distancia dinámica, número de detecciones (hits), primera detección y (si aplica) `modelId`.
- Barra de proximidad (gradiente) visible solo si el dispositivo sigue dentro del radio; porcentaje = `1 - (dist/radius)`.
- Click sobre card fija el `activePOI` para resaltar en el mapa (lógica previa preservada para highlight de modelos). Modelos fijos soportan highlight por `modelId`: `calles`, `edificios` y ahora `44` (nuevo POI "Punto Modelo 44" asociado a `44.glb`).
- Componente antiguo `InfoPanel` queda comentado (puede eliminarse en refactor futuro).

## DevModelEditor (Solo Desarrollo)
- En `operator-frontend/src/components/DevModelEditor.jsx` (+`.css`), existe un editor de modelos 3D que permite añadir múltiples archivos `.glb`, ajustar posición (lon, lat, altura) y orientación (heading, pitch, roll), y copiar el fragmento de JSX generado.
- Solo disponible en modo desarrollo (`npm run dev`). Estos archivos están incluidos en `.gitignore` y no forman parte del bundle de producción.

## 9. Extensiones Seguras
TURN: añadir lista `iceServers` adicional y variable config. DataChannel: ver sección 4. Persistencia POIs: capa asíncrona (no sync I/O dentro handlers). Multi teléfonos: map `{ phoneSocketId -> meta }`, adaptar ruteo oferta/answer/ICE y ampliar eventos (documentar aquí).

## 10. Anti-Patrones
No mover Haversine fuera sin necesidad. No introducir librerías de signaling adicionales. No bloquear loop con I/O sync (excepto carga inicial POIs aceptable). No agregar nuevos rooms arbitrarios sin actualizar sección 7.

## 11. Actualización de Este Archivo
Modificar inmediatamente al añadir evento, cambiar nombres, introducir TURN, multi teléfono o persistencia. Si crece demasiado, consolidar y recortar ejemplos redundantes.

Fin.
