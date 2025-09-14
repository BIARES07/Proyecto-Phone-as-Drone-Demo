// A. Dependencias y Módulos a Importar
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// B. Configuración Inicial y Constantes
const PORT = process.env.PORT || 3001;
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // En producción, deberías restringir esto a dominios específicos
        methods: ["GET", "POST"]
    }
});

// Carga de Datos (Puntos de Interés)
console.log('[INIT] Cargando puntos de interés...');
const dataPath = path.join(__dirname, 'data', 'pointsOfInterest.json');
let pointsOfInterest = [];
try {
    const rawData = fs.readFileSync(dataPath);
    pointsOfInterest = JSON.parse(rawData);
    console.log(`[INIT] ${pointsOfInterest.length} puntos de interés cargados correctamente.`);
} catch (error) {
    console.error('[ERROR] No se pudo leer o parsear pointsOfInterest.json. El servidor continuará sin POIs.', error.message);
}

// C. Almacenamiento de Estado en Memoria
let connectedClients = {
    phoneSocketId: null,
    operatorSocketIds: new Set()
};

// D. Middlewares de Express
app.use(cors());
app.use('/phone', express.static(path.join(__dirname, '..', 'phone-app')));
console.log('[INIT] Middlewares de Express configurados.');

// E. Endpoints HTTP (API REST Básica)
app.get('/', (req, res) => {
    res.status(200).json({ status: "ok", message: "Server is running" });
});

// Función para calcular distancia geodésica (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // en metros
}

// F. Lógica de Socket.IO
io.on('connection', (socket) => {
    console.log(`[CONNECTION] Cliente conectado: ${socket.id}`);

    socket.on('disconnect', (reason) => {
        try {
            if (socket.id === connectedClients.phoneSocketId) {
                connectedClients.phoneSocketId = null;
                io.to('operator-room').emit('phone-disconnected');
                console.log(`[DISCONNECT] El teléfono se ha desconectado. Razón: ${reason}`);
            } else if (connectedClients.operatorSocketIds.has(socket.id)) {
                connectedClients.operatorSocketIds.delete(socket.id);
                console.log(`[DISCONNECT] Operador desconectado: ${socket.id}. Operadores restantes: ${connectedClients.operatorSocketIds.size}. Razón: ${reason}`);
            }
        } catch (error) {
            console.error(`[ERROR] en evento 'disconnect' para socket ${socket.id}:`, error);
        }
    });

    socket.on('register-client', (payload) => {
        try {
            if (!payload || !payload.role) {
                console.warn(`[REGISTER] Registro fallido: payload inválido de ${socket.id}`);
                return;
            }

            switch (payload.role) {
                case 'PHONE':
                    if (connectedClients.phoneSocketId && connectedClients.phoneSocketId !== socket.id) {
                        console.warn(`[REGISTER] Advertencia: Un nuevo teléfono (${socket.id}) se está registrando mientras otro (${connectedClients.phoneSocketId}) ya estaba activo.`);
                    }
                    connectedClients.phoneSocketId = socket.id;
                    socket.join('phone-room');
                    io.to('operator-room').emit('phone-connected');
                    console.log(`[REGISTER] Teléfono registrado con ID: ${socket.id}`);
                    break;
                case 'OPERATOR':
                    connectedClients.operatorSocketIds.add(socket.id);
                    socket.join('operator-room');
                    console.log(`[REGISTER] Operador registrado con ID: ${socket.id}. Total operadores: ${connectedClients.operatorSocketIds.size}`);
                    if (connectedClients.phoneSocketId) {
                        socket.emit('phone-connected');
                    }
                    break;
                default:
                    console.warn(`[REGISTER] Rol desconocido '${payload.role}' para el cliente ${socket.id}`);
            }
        } catch (error) {
            console.error(`[ERROR] en evento 'register-client' para socket ${socket.id}:`, error);
        }
    });

    socket.on('gps-update', (payload) => {
        try {
            if (socket.id !== connectedClients.phoneSocketId) {
                console.warn(`[GPS] Recibido 'gps-update' de un cliente no autorizado: ${socket.id}`);
                return;
            }
            if (!payload || typeof payload.lat !== 'number' || typeof payload.lon !== 'number') {
                console.warn(`[GPS] Payload de GPS inválido recibido del teléfono:`, payload);
                return;
            }

            // console.log(`[GPS] Recibida actualización de GPS: Lat ${payload.lat}, Lon ${payload.lon}`);
            io.to('operator-room').emit('gps-from-phone', payload);

            pointsOfInterest.forEach(poi => {
                const distance = getDistance(payload.lat, payload.lon, poi.latitude, poi.longitude);
                if (distance <= poi.radius) {
                    console.log(`[POI] Teléfono en rango del POI '${poi.name}'. Distancia: ${distance.toFixed(2)}m`);
                    io.to('operator-room').emit('poi-in-range', poi);
                }
            });
        } catch (error) {
            console.error(`[ERROR] en evento 'gps-update' para socket ${socket.id}:`, error);
        }
    });

    // Eventos de Señalización de WebRTC
    socket.on('webrtc-offer', (payload) => {
        try {
            console.log(`[WebRTC] Recibida oferta de ${socket.id}, retransmitiendo a 'phone-room'.`);
            socket.to('phone-room').emit('webrtc-offer', payload);
        } catch (error) {
            console.error(`[ERROR] en evento 'webrtc-offer' para socket ${socket.id}:`, error);
        }
    });

    socket.on('webrtc-answer', (payload) => {
        try {
            console.log(`[WebRTC] Recibida respuesta de ${socket.id}, retransmitiendo a 'operator-room'.`);
            socket.to('operator-room').emit('webrtc-answer', payload);
        } catch (error) {
            console.error(`[ERROR] en evento 'webrtc-answer' para socket ${socket.id}:`, error);
        }
    });

    socket.on('webrtc-ice-candidate', (payload) => {
        try {
            const isPhone = socket.id === connectedClients.phoneSocketId;
            const targetRoom = isPhone ? 'operator-room' : 'phone-room';
            // console.log(`[WebRTC] Retransmitiendo candidato ICE de ${isPhone ? 'Teléfono' : 'Operador'} a ${targetRoom}`);
            socket.to(targetRoom).emit('webrtc-ice-candidate', payload);
        } catch (error) {
            console.error(`[ERROR] en evento 'webrtc-ice-candidate' para socket ${socket.id}:`, error);
        }
    });
});

// G. Inicio del Servidor
httpServer.listen(PORT, () => {
    console.log(`[INIT] Servidor escuchando en http://localhost:${PORT}`);
});
