# Escenarios de Pruebas Manuales Resiliencia y Telemetría

## Objetivo
Verificar que la reconexión automática (sessionId, ICE restart, recreación de PeerConnection) y el watchdog de telemetría funcionan según lo diseñado.

## Métricas Observables
- Overlay RTT (ms)
- Frame silence (s) – debe resetear a ~0 al llegar un frame
- Overlay Telemetry Lost (>10s sin GPS)
- Estados WebRTC (clases pc-state-*)
- Logs consola `[RECOVERY][PHONE]`, `[SESSION]`, `[RECOVERY][OPERATOR]`

## Preparación
1. Levantar backend (`node backend/index.js`) o entorno de despliegue.
2. Abrir operador (`npm run dev` en operator-frontend) con `.env` apuntando al backend.
3. Abrir `phone-app` en un dispositivo móvil (o pestaña separada con permisos de cámara/GPS simulados) y pulsar iniciar.

## Casos
### 1. Corte Breve de Red (Reconexión Rápida <10s)
- Acción: Desactivar WiFi del teléfono ~5s (o activar modo avión 5s) y reactivar.
- Esperado:
  - UI teléfono muestra estados de desconexión y luego recuperación.
  - Operador NO debe requerir recarga, video vuelve solo.
  - RTT vuelve a valores previos.
  - No se muestra Telemetry Lost si el corte <10s (o desaparece rápido).

### 2. Corte Prolongado (30–60s)
- Acción: Modo avión 45s.
- Esperado:
  - Operador muestra Telemetry Lost (>10s).
  - Al volver la red: evento `phone-reconnected` en consola operador.
  - Nueva oferta -> answer -> video restablecido.
  - Frame silence vuelve a contar desde 0.

### 3. Reinicio de Backend
- Acción: Mientras transmisión activa, reiniciar proceso backend.
- Esperado:
  - Teléfono intentará reconectar socket (logs reconnection attempt).
  - Nuevo `register-client` con mismo `sessionId` => backend emite `phone-reconnected`.
  - Se genera nueva oferta (si PC previa no conectada) y video vuelve.

### 4. Falta de ICE / NAT Cambio
- Acción: Pasar de WiFi a datos móviles durante transmisión.
- Esperado:
  - `connectionState` puede ir a `disconnected/failed`.
  - Teléfono intenta ICE restart (`[RECOVERY][PHONE] ICE restart`), si falla recrea PC.
  - Video se restablece.

### 5. Video Freeze sin Desconexión
- Acción: Cubrir cámara o pausar track (developer tools: detener track) durante 10s.
- Esperado:
  - Frame silence >10s aumenta; Telemetry Lost no aparece (GPS sigue).
  - Al reanudar video, frame silence baja a ~0.

### 6. Ausencia de GPS (Permisos Revocados)
- Acción: Revocar permiso de geolocalización o bloquearlo.
- Esperado:
  - No llegan nuevos `gps-from-phone` -> Telemetry Lost >10s.
  - Al restaurar permisos, desaparece overlay tras primer GPS.

### 7. Repetición de Ofertas Múltiples
- Acción: Forzar rápida secuencia de reconexiones (cortes de red quick toggle).
- Esperado:
  - Operador cierra PC previa antes de nueva oferta (sin errores de duplicado).
  - No se acumulan múltiples objetos RTCPeerConnection (ver devtools heap si se desea).

### 8. Persistencia de sessionId
- Acción: Refrescar página del teléfono sin limpiar storage.
- Esperado:
  - Se reusa mismo `sessionId` (ver log `[SESSION][PHONE]`).
  - Operador recibe `phone-reconnected` (no `phone-connected`).

## Criterios de Aprobación
- Todos los escenarios recuperan video sin recargar manualmente la interfaz operador.
- Ningún escenario requiere volver a pulsar Start en el teléfono tras recuperar la conectividad (excepto reinicio completo de pestaña).
- Telemetry Lost sólo aparece cuando se supera realmente el umbral sin GPS.
- RTT vuelve a rango normal (< 3000 ms en escenarios locales) tras recuperación.

## Seguimiento de Errores
Registrar cualquier excepción no controlada en consola y abrir issue con:
- Escenario
- Logs relevantes (recuperación / ICE)
- Timestamp
- Pasos para reproducir

Fin.
