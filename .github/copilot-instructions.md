# Instrucciones para Agentes de IA

Estas pautas condensan la arquitectura y convenciones reales del proyecto Phone-as-Drone Demo.
Mantén las respuestas concretas y aplica estos patrones antes de proponer refactors.

## 1. Arquitectura Big Picture
- 3 piezas desacopladas:
  1) `backend/` (Node + Express + Socket.IO) -> señalización WebRTC + broadcast GPS + detección de POIs + sirve `phone-app/` bajo `/phone`.
  2) `phone-app/` (HTML+JS vanilla) -> captura cámara/micrófono + GPS + inicia oferta WebRTC + emite `gps-update`.
  3) `operator-frontend/` (React + Vite + Cesium/Resium) -> recibe video, telemetría y eventos de proximidad POI, renderiza mapa 3D.
- No hay DB persistente: estado en memoria (`connectedClients`, `pointsOfInterest`). Reinicios limpian estado runtime.

## 2. Flujo de Datos Principal
`phone-app` -> (Socket.IO: `register-client` PHONE) -> servidor guarda `phoneSocketId`.
Operador -> (Socket.IO: `register-client` OPERATOR) -> servidor lo añade a `operator-room` y notifica si el teléfono ya está.
GPS: teléfono emite `gps-update` => backend re-emite `gps-from-phone` a operadores y, si distancia <= radius de un POI, emite `poi-in-range`.
Video: teléfono crea oferta (`webrtc-offer`) -> backend la reenvía a operadores -> operador responde (`webrtc-answer`) -> backend reenvía al teléfono. ICE candidatos (`webrtc-ice-candidate`) se enrutan cruzado según rol.

## 3. Eventos Socket.IO (nombres exactos)
- Cliente -> Servidor: `register-client {role: 'PHONE'|'OPERATOR'}` | `gps-update {lat, lon, alt?}` | `webrtc-offer {sdp}` | `webrtc-ice-candidate {candidate}` | `webrtc-answer {sdp}` (solo operador).
- Servidor -> Operador: `phone-connected` | `phone-disconnected` | `gps-from-phone {lat, lon, alt?}` | `poi-in-range {name, latitude, longitude, radius, info}` | `webrtc-offer {sdp}` | `webrtc-ice-candidate {candidate}`.
- Servidor -> Teléfono: `webrtc-answer {sdp}` | `webrtc-ice-candidate {candidate}`.

## 4. WebRTC Patrón Actual
- 1 PeerConnection por sesión; operador la crea tras recibir la oferta.
- STUN fijo: `stun:stun.l.google.com:19302` en ambos lados (sin TURN; añadir TURN si falla tras CGNAT / redes corporativas).
- El teléfono envía solo media (no se establece canal de datos). Para agregar datos, documentar nuevo evento y canal.

## 5. POIs
- Archivo fuente: `backend/data/pointsOfInterest.json` cargado en arranque.
- Cálculo de distancia: función Haversine `getDistance` en `backend/index.js` (metros, radio Tierra = 6371e3).
- Para modificar / añadir POIs, editar JSON y reiniciar servidor; no hay recarga dinámica.

## 6. Variables y Configuración
- Backend puerto: `PORT` (default 3001). Servidor log: `[INIT]`, `[REGISTER]`, `[GPS]`, `[WebRTC]` tags.
- Front operador requiere `VITE_BACKEND_URL` en tiempo de build/ejecución (ej: `http://localhost:3001`). Si falta, la conexión fallará silenciosamente.
- `phone-app` usa URL fija `SERVER_URL` definida en `phone-app/script.js`; actualizar para despliegues.

## 7. Convenciones de Código
- Logging semiestructurado con prefijos en mayúsculas entre corchetes para facilitar grep.
- Validación defensiva de payloads (ver `gps-update` y `register-client`). Mantener antes de extender eventos.
- Rooms Socket.IO: `'phone-room'` (único emisor) y `'operator-room'` (múltiples receptores). No crear rooms adicionales sin necesidad clara.
- Estado global mínimo en objetos locales; evitar introducir singleton externos.

## 8. Extensiones Seguras / Ejemplos
- Añadir canal de datos: agregar en oferta una `dataChannel` lado teléfono y escuchar `ondatachannel` lado operador; propagar eventos via ese canal sin tocar señalización.
- Añadir persistencia de POIs: introducir capa simple (p.ej. escribir JSON) pero proteger contra I/O sync en loop de eventos.
- Multiples teléfonos: requeriría mapear `phoneSocketId` -> metadata y ajustar enrutamiento de ofertas; actualizar secciones 2 y 3.

## 9. Build & Run (local)
Backend: dentro de `backend/` ejecutar `npm install` y luego `node index.js` (añadir script `start` si se automatiza). Servirá `/phone`.
Operador: en `operator-frontend/` definir `.env` con `VITE_BACKEND_URL=http://localhost:3001`, luego `npm install` y `npm run dev` (Vite).
Teléfono: abrir `http://localhost:3001/phone/` desde un dispositivo móvil y presionar "Iniciar Transmisión".

## 10. No Hacer / Anti-Pattern
- No mezclar lógica WebRTC y cálculo de distancias en un mismo módulo; mantener separación actual.
- No introducir dependencias pesadas de signaling: Socket.IO ya cumple.
- No reemplazar Haversine por librerías para este tamaño de proyecto salvo justificación (performance innecesaria).

## 11. Documentar Cambios
Al agregar eventos, actualizar sección 3 y ejemplos de flujo. Mantener este archivo <50 líneas efectivas (excluyendo títulos) — eliminar secciones obsoletas si crece.

Fin.
