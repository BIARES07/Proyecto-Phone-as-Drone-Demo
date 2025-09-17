# Instrucciones para Agentes de IA
Resumen vivo de arquitectura y convenciones del proyecto Phone-as-Drone Demo. Mantener conciso (<50 líneas efectivas) y actualizar cuando cambie señalización, eventos o estructura.

## 1. Arquitectura
1) `backend/` (Node + Express + Socket.IO) señaliza WebRTC, reemite GPS, detecta POIs, sirve `phone-app/` bajo `/phone`. Estado en memoria: `connectedClients`, `pointsOfInterest`, `sessions{ sessionId->{phoneSocketId,lastSeen} }` (reinicios limpian).
2) `phone-app/` (HTML/JS vanilla) captura cámara+micrófono, GPS, oferta WebRTC, emite `gps-update`, incluye consola embebida (limite 500 logs, toggle Mostrar/Ocultar), resiliencia con `sessionId` persistido en `localStorage` + ICE restart y recreación de PC.
3) `operator-frontend/` (React + Vite + Cesium/Resium + `vite-plugin-cesium`) recibe video, telemetría, POIs; UI con ventana de video PIP draggable, atajos: v (oculta/muestra), f (fullscreen), watchdog GPS y métricas (RTT, frame silence).

## 2. Flujo Core
Registro: PHONE -> `register-client {sessionId?}`; si sessionId nuevo => `phone-connected`; si sessionId existente => `phone-reconnected`. OPERATOR -> entra a `operator-room` y recibe estado si teléfono presente.
GPS: PHONE -> `gps-update` (con `heading`) => broadcast `gps-from-phone`; si dentro de radio POI => `poi-in-range`.
WebRTC: PHONE crea `webrtc-offer` -> operadores; operador crea `webrtc-answer` -> teléfono. ICE: cada lado -> backend -> lado opuesto (`operator-room` / `phone-room`). Al desconectar teléfono => `phone-disconnected` y operador limpia PeerConnection.

## 3. Eventos Socket.IO
Cliente→Servidor: `register-client {role:'PHONE'|'OPERATOR',sessionId?}` | `gps-update {lat,lon,alt?,heading?}` | `webrtc-offer {sdp}` | `webrtc-answer {sdp}` (solo operador) | `webrtc-ice-candidate {candidate}` | `operator-ping {seq}` (ack para RTT).
Servidor→Operador: `phone-connected {sessionId?}` | `phone-reconnected {sessionId}` | `phone-disconnected` | `gps-from-phone {lat,lon,alt?,heading?}` | `poi-in-range {...}` | `webrtc-offer {sdp}` | `webrtc-ice-candidate {candidate}`.
Servidor→Teléfono: `webrtc-answer {sdp}` | `webrtc-ice-candidate {candidate}`.

## 4. WebRTC Detalles
1 PC activa; resiliencia: teléfono intenta `ICE restart` si `disconnected/failed`, y recrea PC si no recupera en ~8s. STUN único `stun:stun.l.google.com:19302` (sin TURN). Operador: cierra PC previa al recibir nueva oferta. (DataChannel aún no implementado.)

## 5. POIs
Fuente: `backend/data/pointsOfInterest.json`. Distancia: Haversine `getDistance` (R=6371e3 m). Editar JSON + reiniciar para cambios. Evento `poi-in-range` se dispara cada actualización de GPS dentro del radio (no se hace supresión de duplicados: manejar en UI si se añade lógica futura).

## 6. Configuración
Backend puerto `PORT` (def 3001). Logs: `[INIT] [CONNECTION] [REGISTER] [GPS] [POI] [WebRTC] [DISCONNECT] [ERROR] [SESSION] [RECOVERY]`. Operador requiere `.env` con `VITE_BACKEND_URL`. Teléfono constante `SERVER_URL`. Añadidos: `operator-ping` ack para RTT y sesiones con TTL (`SESSION_TTL_MS`).

## 7. Convenciones y Rooms
Rooms: `'phone-room'` (el teléfono), `'operator-room'` (todos operadores). Validación defensiva de payloads (tipos numéricos en GPS, rol en registro). Advertencia multi-teléfono: si llega otro PHONE se sobrescribe `phoneSocketId` y se loguea warning (no soportado formalmente aún). Mantener estado simple sin singletons externos.

## 8. UI / UX Operador
Ventana PIP draggable. Estados WebRTC en clases `pc-state-*`. Panel `GpsDisplay`. Overlays: `Telemetry Lost` si >10s sin `gps-from-phone`; métricas: RTT signaling (ping ack) y silencio de frames (segundos desde último frame). Frame monitor usa `requestVideoFrameCallback` si disponible.

### Panel de POIs Activos (Nuevo)
Reemplaza al antiguo `InfoPanel` único. Ahora se mantiene un `Map` en memoria en el frontend con POIs "activos" (último evento `poi-in-range` dentro de un TTL).

 - Modelos fijos en mapa (con posible highlight por `modelId` si aplica): `calles` (`/calles.glb`), `edificios` (`/edificios.glb`), `44` (`/44.glb`), `piramide` (`/piramide.glb`), `torrehumboldt` (`/torrehumboldt.glb`) y `concresa` (`/concresa.glb`). POIs añadidos para estos tres últimos con `modelId` correspondiente.
 - Campo `info` de los POIs acepta Markdown (GFM) y se renderiza en el panel con `react-markdown`.


## DevModelEditor (Solo Desarrollo)
- En `operator-frontend/src/components/DevModelEditor.jsx` (+`.css`), existe un editor de modelos 3D que permite añadir múltiples archivos `.glb`, ajustar posición (lon, lat, altura) y orientación (heading, pitch, roll), y copiar el fragmento de JSX generado.
- Solo disponible en modo desarrollo (`npm run dev`). Estos archivos están incluidos en `.gitignore` y no forman parte del bundle de producción.

## 9. Extensiones Seguras
TURN: añadir lista `iceServers` + variable config. DataChannel: permitir pings finos y comandos. Persistencia POIs futura. Multi teléfonos: requerirá map sesiones→socket y selección UI. ICE servers adicionales mejorarían recuperación NAT estricta.

## 10. Anti-Patrones
No mover Haversine fuera sin necesidad. No introducir librerías de signaling adicionales. No bloquear loop con I/O sync (excepto carga inicial POIs aceptable). No agregar nuevos rooms arbitrarios sin actualizar sección 7.

## 11. Actualización de Este Archivo
Modificar inmediatamente al añadir evento, cambiar nombres, introducir TURN, multi teléfono o persistencia. Si crece demasiado, consolidar y recortar ejemplos redundantes.

Fin.
