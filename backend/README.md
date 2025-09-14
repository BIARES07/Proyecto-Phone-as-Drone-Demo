# Backend (Phone-as-Drone Demo)
Servidor Express + Socket.IO que:
- Señaliza WebRTC (oferta/answer/ICE)
- Reemite coordenadas GPS y evalúa POIs
- Sirve `phone-app` bajo `/phone`

Instrucciones completas: ver README raíz (`../README.md`).

Uso rápido:
```
cd backend
npm install
node index.js   # (opcional añadir script "start")
```

Variables: `PORT` (default 3001).
Editar POIs: `data/pointsOfInterest.json` + reiniciar.
