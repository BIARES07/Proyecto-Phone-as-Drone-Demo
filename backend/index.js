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

// Sesiones persistentes en memoria (simple) => { [sessionId]: { phoneSocketId, lastSeen } }
// Nota: Solo se soporta 1 teléfono activo a la vez todavía, pero el sessionId permite reatachar tras reconexión.
const sessions = {}; // sessionId -> { phoneSocketId, lastSeen }
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || '600000', 10); // 10 minutos por defecto

function cleanupStaleSessions() {
    const now = Date.now();
    Object.entries(sessions).forEach(([sid, meta]) => {
        if (now - meta.lastSeen > SESSION_TTL_MS) {
            console.log(`[SESSION] Limpiando sesión expirada ${sid}`);
            delete sessions[sid];
        }
    });
}
setInterval(cleanupStaleSessions, 60_000).unref();

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
                    const sessionId = (payload.sessionId && typeof payload.sessionId === 'string' && payload.sessionId.length <= 64)
                        ? payload.sessionId
                        : null;

                    if (!sessionId) {
                        // Modo legacy (sin sessionId) => comportamiento previo
                        if (connectedClients.phoneSocketId && connectedClients.phoneSocketId !== socket.id) {
                            console.warn(`[REGISTER] (LEGACY) Nuevo teléfono (${socket.id}) reemplaza a ${connectedClients.phoneSocketId}.`);
                        }
                        connectedClients.phoneSocketId = socket.id;
                        socket.join('phone-room');
                        io.to('operator-room').emit('phone-connected');
                        console.log(`[REGISTER] (LEGACY) Teléfono registrado sin sessionId. Socket: ${socket.id}`);
                        break;
                    }

                    const existing = sessions[sessionId];
                    if (existing) {
                        // Reconexión de sesión existente
                        console.log(`[SESSION] Reatach de sesión ${sessionId}. Antiguo socket: ${existing.phoneSocketId} -> nuevo socket: ${socket.id}`);
                        existing.phoneSocketId = socket.id;
                        existing.lastSeen = Date.now();
                        connectedClients.phoneSocketId = socket.id; // mantener compat con lógica actual
                        socket.join('phone-room');
                        io.to('operator-room').emit('phone-reconnected', { sessionId });
                    } else {
                        // Nueva sesión
                        sessions[sessionId] = { phoneSocketId: socket.id, lastSeen: Date.now() };
                        if (connectedClients.phoneSocketId && connectedClients.phoneSocketId !== socket.id) {
                            console.warn(`[REGISTER] Nuevo teléfono (${socket.id}) registrado con sessionId ${sessionId} mientras había otro (${connectedClients.phoneSocketId}). Se sobrescribe.`);
                        }
                        connectedClients.phoneSocketId = socket.id;
                        socket.join('phone-room');
                        io.to('operator-room').emit('phone-connected', { sessionId });
                        console.log(`[REGISTER] Teléfono registrado con sessionId=${sessionId} socket=${socket.id}`);
                    }
                    break;
                case 'OPERATOR':
                    connectedClients.operatorSocketIds.add(socket.id);
                    socket.join('operator-room');
                    console.log(`[REGISTER] Operador registrado con ID: ${socket.id}. Total operadores: ${connectedClients.operatorSocketIds.size}`);
                    if (connectedClients.phoneSocketId) { // se le puede enviar info de sesión si existe
                        // Buscar sessionId activo (lineal ya que solo 1 esperado)
                        let activeSessionId = null;
                        for (const [sid, meta] of Object.entries(sessions)) {
                            if (meta.phoneSocketId === connectedClients.phoneSocketId) { activeSessionId = sid; break; }
                        }
                        socket.emit('phone-connected', activeSessionId ? { sessionId: activeSessionId } : undefined);
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

            // actualizar lastSeen de la sesión activa (si se identifica)
            for (const [sid, meta] of Object.entries(sessions)) {
                if (meta.phoneSocketId === socket.id) {
                    meta.lastSeen = Date.now();
                    break;
                }
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
            // Corregido: la oferta SIEMPRE debe llegar a los operadores (operator-room),
            // porque el teléfono es quien inicia la oferta y los operadores generan la answer.
            if (socket.id !== connectedClients.phoneSocketId) {
                console.warn(`[WebRTC] Oferta ignorada: ${socket.id} no es el teléfono registrado.`);
                return;
            }
            if (connectedClients.operatorSocketIds.size === 0) {
                console.warn('[WebRTC] Oferta recibida pero no hay operadores conectados actualmente.');
            }
            console.log(`[WebRTC] Oferta recibida del teléfono ${socket.id}. Reenviando a 'operator-room' (${connectedClients.operatorSocketIds.size} operadores).`);
            socket.to('operator-room').emit('webrtc-offer', payload);
        } catch (error) {
            console.error(`[ERROR] en evento 'webrtc-offer' para socket ${socket.id}:`, error);
        }
    });

    socket.on('webrtc-answer', (payload) => {
        try {
            // Corregido: la answer debe volver únicamente al teléfono.
            if (!connectedClients.phoneSocketId) {
                console.warn('[WebRTC] Answer recibida pero no hay teléfono registrado.');
                return;
            }
            const isOperator = connectedClients.operatorSocketIds.has(socket.id);
            if (!isOperator) {
                console.warn(`[WebRTC] Answer ignorada: ${socket.id} no es un operador registrado.`);
                return;
            }
            console.log(`[WebRTC] Answer recibida de operador ${socket.id}. Enviando al teléfono ${connectedClients.phoneSocketId}.`);
            io.to(connectedClients.phoneSocketId).emit('webrtc-answer', payload);
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

    // Ping de operador para medir RTT signaling (ack con callback)
    socket.on('operator-ping', (payload, ack) => {
        try {
            if (typeof ack === 'function') {
                ack({ pong: true, serverTs: Date.now(), echo: payload?.seq });
            }
        } catch (e) {
            console.error('[ERROR] operator-ping', e);
        }
    });

    // Estado espejo: operador -> teléfono
    socket.on('operator-state', (payload) => {
        try {
            const isOperator = connectedClients.operatorSocketIds.has(socket.id);
            if (!isOperator) return;
            // Reenviar al teléfono
            if (connectedClients.phoneSocketId) {
                io.to('phone-room').emit('operator-state', payload);
            }
        } catch (e) {
            console.error('[ERROR] operator-state', e);
        }
    });

    // Estado espejo: teléfono -> operadores
    socket.on('phone-state', (payload) => {
        try {
            const isPhone = socket.id === connectedClients.phoneSocketId;
            if (!isPhone) return;
            io.to('operator-room').emit('phone-state', payload);
        } catch (e) {
            console.error('[ERROR] phone-state', e);
        }
    });
});

// G. Inicio del Servidor
httpServer.listen(PORT, () => {
    console.log(`[INIT] Servidor escuchando en http://localhost:${PORT}`);
});
