# Phone-as-Drone Demo

Proyecto demostrativo que convierte un teléfono en una "cámara/drone" improvisado: el dispositivo móvil transmite video, audio y coordenadas GPS a un panel de operador con mapa 3D (Cesium) vía WebRTC + Socket.IO.

## 1. Características Clave
- Streaming WebRTC (1 teléfono -> múltiples operadores).
- Telemetría GPS en tiempo real (posición y rumbo) + detección de proximidad a Puntos de Interés (POIs).
- Mapa 3D (Cesium/Resium) mostrando posición y orientación del dispositivo con un ícono de flecha.
- Ventana de video PIP draggable, atajos: `v` (mostrar/ocultar), `f` (fullscreen/normal).
- Consola embebida en el teléfono para depurar (límite 500 logs, toggle Mostrar/Ocultar).
- Arquitectura simple sin base de datos (estado en memoria, reinicio = limpieza).

## 2. Arquitectura de Directorios
```
backend/            # Express + Socket.IO (señalización WebRTC, GPS, POIs, sirve /phone)
  index.js
  data/pointsOfInterest.json
phone-app/          # Cliente del teléfono (HTML/JS, media + GPS + oferta WebRTC)
  index.html
  script.js
operator-frontend/  # Panel del operador (React + Vite + Cesium/Resium)
  src/
.github/            # Instrucciones internas (copilot-instructions.md)
README.md           # Este documento
```

## 3. Flujo Simplificado
1. Teléfono se conecta y emite `register-client {role:'PHONE'}` → el servidor guarda `phoneSocketId` y avisa a operadores (`phone-connected`).
2. Operador se conecta con `register-client {role:'OPERATOR'}` y entra a `operator-room`.
3. Teléfono captura media + GPS. Cada fix GPS → `gps-update` (con lat, lon, alt, heading) → broadcast `gps-from-phone`. Si dentro de radio de algún POI → `poi-in-range`.
4. Teléfono crea `webrtc-offer` → operadores. Operador crea `webrtc-answer` → teléfono. ICE candidates cruzados por Socket.IO.
5. Al desconectarse el teléfono → `phone-disconnected` → los operadores limpian PeerConnection y UI.

## 4. Requisitos
- Node.js 18+ (probado con 18/20).
- Navegador moderno (Chrome/Edge/Firefox) en el teléfono con permisos de cámara, micrófono y geolocalización.
- Para Cesium en dev: conexión a internet (descarga assets y terrain por defecto).

## 5. Puesta en Marcha Rápida (Local)
En 3 terminales (PowerShell en Windows):
```powershell
# 1. Backend
cd backend
npm install
node index.js   # Servirá en http://localhost:3001 y ruta /phone

# 2. Operador (React)
cd ../operator-frontend
npm install
# Crear .env si no existe
"VITE_BACKEND_URL=http://localhost:3001" | Out-File -Encoding utf8 .env
npm run dev     # Vite mostrará la URL (ej: http://localhost:5173)

# 3. Teléfono
# Desde el dispositivo móvil abrir: http://<IP_LOCAL_PC>:3001/phone/
# (Reemplazar <IP_LOCAL_PC> por la IP LAN del equipo, ej: 192.168.1.50)
```
Sugerencia: Desactivar ahorro de energía / bloqueo de pantalla al probar GPS continuo.

## 6. Variables de Entorno / Configuración
| Contexto | Variable / Constante | Descripción |
|----------|----------------------|-------------|
| Backend  | PORT                 | Puerto Express (defecto 3001). |
| Operador | VITE_BACKEND_URL     | URL base Socket.IO (incluye protocolo y puerto). |
| Teléfono | SERVER_URL (script.js)| Constante con URL del backend (ajustar para local vs despliegue). |

## 7. Scripts NPM
Actualmente:
- `backend/`: (solo placeholder `test`). Puedes añadir `"start": "node index.js"`.
- `operator-frontend/`: `dev`, `build`, `preview`, `lint`.

## 8. WebRTC Detalles
- 1 PeerConnection por sesión (un teléfono). Operador añade transceivers `recvonly` (`video`, `audio`) para garantizar tracks.
- ICE servers: solo STUN `stun:stun.l.google.com:19302` (sin TURN: llamadas pueden fallar tras CGNAT/Firewall restrictivo; añadir TURN para producción robusta).
- No hay DataChannel todavía. Extensión: crear en teléfono `pc.createDataChannel('telemetry')` y manejar `ondatachannel` en operador.

## 9. POIs
- Fuente: `backend/data/pointsOfInterest.json` (estructura: `[ { name, latitude, longitude, radius, info } ]`).
- Distancias: Haversine (metros). Se evalúa cada `gps-update` y se emite `poi-in-range` sin supresión de duplicados (UI recibe cada tick en rango).
- Modificar: editar JSON + reiniciar backend.

## 10. Telemetría GPS (Campos Nuevos y Visualización)
Desde la actualización reciente, el payload emitido por el teléfono en `gps-update` incluye:
```
{
  lat: number,
  lon: number,
  alt: number|null,
  heading: number|null,      // 0-360 (desde norte, horario) si el navegador lo provee
  accuracy: number|null,     // metros (Horizontal Accuracy)
  speed: number|null,        // m/s
  ts: number                 // timestamp epoch ms
}
```
En el operador:
- Si `heading` es nulo y existe un fix previo y se avanza > 1 m, se deriva un rumbo (bearing) entre la posición anterior y la nueva, etiquetado como `headingSource: 'derived'`.
- Si no hay heading disponible se marca `headingSource: 'none'`.
- Se aplica suavizado angular (EMA) para evitar saltos bruscos.
- El marcador ahora es un punto 2D (PointGraphics) clamp al terreno + círculo de precisión (ellipse) con radio = accuracy.
- Indicador de rumbo: una línea corta delante del punto cuando hay heading válido.
- La cámara realiza *tracking* automático de la entidad al aparecer para mantenerla centrada.

## 11. UI Operador
- Ventana PIP: arrastrable (mousedown sobre el área excepto botones). Clases dinámicas de estado WebRTC `pc-state-<state>`.
- Teclas: `v` toggle visibilidad PIP, `f` fullscreen.
- Panel `GpsDisplay`: formatea con hemisferios (N/S/E/W). `InfoPanel`: último POI en rango.

## 12. Consola Embebida (Teléfono)
- Intercepta `console.log|warn|error|debug`, muestra timestamp ISO parcial.
- Límite 500 entradas (FIFO). Botones: Mostrar/Ocultar, Limpiar. Auto-expande si aparecen errores iniciales.

## 13. Extensiones Futuras Sugeridas
| Idea | Notas |
|------|-------|
| TURN Servers | Añadir a `iceServers` y variable de entorno. |
| DataChannel | Telemetría extra (batería, fps) o comandos (pausa video). |
| Multi-Teléfono | Cambiar `phoneSocketId` por mapa y namespacing de eventos. |
| Persistencia POIs | Capa asíncrona (no I/O bloqueante en handlers). |
| Lista histórica POIs | Acumular eventos y evitar duplicados consecutivos. |

## 14. Troubleshooting
| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Operador no ve video | Oferta no llega / STUN bloqueado | Revisar consola operador y teléfono, abrir puertos UDP, probar otra red. |
| GPS no aparece o flecha no rota | Permiso denegado / GPS sin señal de rumbo | Revisar ajustes del navegador/SO, recargar, moverse para obtener señal de rumbo. |
| `phone-disconnected` frecuente | WiFi inestable / pantalla suspendida | Mantener pantalla activa, probar alimentación. |
| ICE se queda en `checking` | Falta TURN detrás de NAT simétrica | Añadir servidor TURN. |
| Sin POIs en logs | JSON inválido o radius muy pequeño | Ver logs backend `[ERROR]` / ajustar `radius`. |

## 15. Seguridad / Consideraciones
- Sin autenticación: no exponer públicamente sin capa adicional (token simple o auth reversa). 
- CORS abierto `*` (cerrar en producción). 
- Media sin cifrado adicional: WebRTC ya cifra SRTP; inspeccionar si se introducen proxys.

## 16. Licencia
Definir licencia (ej. MIT) antes de divulgar públicamente.

## 17. Referencia Rápida de Eventos
```
Client→Server: register-client | gps-update | webrtc-offer | webrtc-answer | webrtc-ice-candidate
Server→Operator: phone-connected | phone-disconnected | gps-from-phone | poi-in-range | webrtc-offer | webrtc-ice-candidate
Server→Phone: webrtc-answer | webrtc-ice-candidate
```

---
Documento unificado. Ver detalles operativos internos adicionales en `./.github/copilot-instructions.md`.
