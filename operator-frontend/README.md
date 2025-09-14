# Operator Frontend (Phone-as-Drone Demo)
Panel React (Vite + Cesium/Resium) para visualizar video y telemetría del teléfono.

Características rápidas:
- Ventana PIP draggable, atajos `v` (mostrar/ocultar) y `f` (fullscreen)
- Panel GPS + InfoPanel de último POI en rango

Configuración mínima:
```
cd operator-frontend
npm install
echo "VITE_BACKEND_URL=http://localhost:3001" > .env
npm run dev
```

Guía completa y arquitectura: ver README raíz (`../README.md`).
