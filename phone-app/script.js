// B. Lógica del Archivo script.js

// 1. Variables Globales y Constantes
const SERVER_URL = "https://proyecto-phone-as-drone-demo.onrender.com"; // Cambia a tu URL de Render cuando despliegues
let socket;
let peerConnection;
let localStream;
let sessionId = null;
let isStreaming = false;
let pendingRecovery = false;
let lastOfferAt = 0;
let reconnectionCount = 0;
let iceRestartCount = 0;
let recreateCount = 0;
let currentFacing = 'environment'; // 'user' | 'environment'

// Parámetros de recuperación
const RECOVERY_COOLDOWN_MS = 5000;
const ICE_RESTART_TIMEOUT_MS = 8000;
const CONNECTION_FAILED_GRACE_MS = 2000;

// Referencias al DOM
const startButton = document.getElementById('startButton');
const localVideo = document.getElementById('localVideo');
const statusDiv = document.getElementById('status');
const switchCamBtn = document.getElementById('switchCamBtn');

// 2. Función de Inicialización Principal main()
function main() {
    // Añade un event listener al startButton para el evento click
    startButton.addEventListener('click', startStreaming);
    switchCamBtn.addEventListener('click', switchCamera);
    
    // Llama a initializeSocketConnection()
    initializeSocketConnection();
}

// 3. Lógica de Socket.IO
function initializeSocketConnection() {
    initSessionId();
    socket = io(SERVER_URL, {
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        reconnectionDelayMax: 4000,
        timeout: 20000
    });

    // Definir todos los listeners de Socket.IO aquí
    socket.on('connect', () => {
        statusDiv.textContent = 'Conectado al servidor';
        socket.emit('register-client', { role: 'PHONE', sessionId });
    });

    socket.on('reconnect_attempt', (n) => {
        updateStatus(`Reintentando conexión (intento ${n})...`, 'warn');
    });

    socket.on('reconnect', (n) => {
        reconnectionCount++;
        updateStatus(`Reconectado (intentos previos: ${n})`, 'info');
        socket.emit('register-client', { role: 'PHONE', sessionId });
        // Si ya estábamos transmitiendo, validar estado PC
        if (isStreaming) {
            scheduleConnectionHealthCheck();
        }
    });

    socket.on('disconnect', (reason) => {
        updateStatus(`Desconectado: ${reason}`, 'error');
    });

    socket.on('webrtc-answer', (payload) => {
        handleWebRTCAnswer(payload);
    });

    socket.on('webrtc-ice-candidate', (payload) => {
        handleNewICECandidate(payload);
    });

    // Estado espejo desde el operador
    socket.on('operator-state', (payload) => {
        try {
            const { connectionState, videoOk, secondsSinceFrame } = payload || {};
            console.log('[MIRROR][PHONE] operator-state', payload);
            const mirror = document.getElementById('operatorMirror');
            if (mirror) {
                mirror.textContent = `Operador: conn=${connectionState||'?'}, video=${videoOk?'OK':'NO'}, frameSilence=${secondsSinceFrame||0}s`;
            }
        } catch (e) { console.warn('[MIRROR][PHONE] operator-state error', e); }
    });
}

// 4. Lógica de Streaming y Hardware
async function startStreaming() {
    // Deshabilitar el startButton para evitar múltiples clics
    startButton.disabled = true;
    statusDiv.textContent = 'Solicitando permisos...';

    try {
        // Solicitar permisos para video y audio
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacing }, audio: true });
        localVideo.srcObject = localStream;
        statusDiv.textContent = 'Permisos concedidos. Iniciando transmisión...';
        switchCamBtn.disabled = false;

        // Activar GPS y WebRTC
    activateGPS(socket);
    startWebRTCCall(socket, localStream);
    isStreaming = true;

    // Abrir consola embebida automáticamente al iniciar transmisión
    try {
        const wrapper = document.getElementById('embeddedConsoleWrapper');
        const btnToggle = document.getElementById('toggleConsoleBtn');
        if (wrapper && btnToggle && wrapper.classList.contains('collapsed')) {
            wrapper.classList.remove('collapsed');
            btnToggle.textContent = 'Ocultar';
        }
    } catch {}

    } catch (error) {
        statusDiv.textContent = 'Error al obtener permisos: ' + error.message;
        console.error("Error en startStreaming:", error);
        // Re-habilitar el startButton si falla
        startButton.disabled = false;
    }
}

function activateGPS(socket) {
    if (!navigator.geolocation) {
        statusDiv.textContent += ' | GPS no soportado.';
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    };

    navigator.geolocation.watchPosition(
        (position) => {
            const { latitude: lat, longitude: lon, altitude: alt, heading, accuracy, speed } = position.coords;
            const gpsData = { 
                lat, 
                lon, 
                alt: (typeof alt === 'number' ? alt : null),
                heading: (typeof heading === 'number' ? heading : null),
                accuracy: (typeof accuracy === 'number' ? accuracy : null),
                speed: (typeof speed === 'number' ? speed : null),
                ts: Date.now()
            };
            socket.emit('gps-update', gpsData);
            console.log('[PHONE][GPS sent]', gpsData);
        },
        (error) => {
            console.error('Error de GPS:', error);
            statusDiv.textContent = 'Error de GPS: ' + error.message;
        },
        options
    );
}

// 5. Lógica de WebRTC
async function startWebRTCCall(socket, stream) {
    // Configuración de servidores STUN
    peerConnection = new RTCPeerConnection({
        iceServers: [{
            urls: 'stun:stun.l.google.com:19302'
        }]
    });

    // Definir Handlers de la Conexión
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[DBG][PHONE][ICE] Candidato local generado');
            socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('Estado de la conexión WebRTC:', state);
        statusDiv.textContent = `Estado WebRTC: ${state}`;
        try { socket.emit('phone-state', { connectionState: state, ts: Date.now() }); } catch {}
        if (state === 'disconnected') {
            setTimeout(() => {
                if (peerConnection && peerConnection.connectionState === 'disconnected') {
                    console.log('[RECOVERY][PHONE] persistente estado disconnected, intentando recuperación');
                    attemptRecovery('ICE_RESTART');
                }
            }, CONNECTION_FAILED_GRACE_MS);
        } else if (state === 'failed') {
            attemptRecovery('ICE_RESTART');
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        console.log('[DBG][PHONE][ICE] iceConnectionState:', peerConnection.iceConnectionState);
    };

    peerConnection.onsignalingstatechange = () => {
        console.log('[DBG][PHONE][SIG] signalingState:', peerConnection.signalingState);
    };

    // Añadir el Stream Local a la conexión
    stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
        console.log('[DBG][PHONE] Track añadida a PC:', track.kind, track.id, track.readyState);
    });

    try {
        // Crear y Enviar la Oferta
        await createAndSendOffer();
        statusDiv.textContent = 'Transmitiendo video y GPS.';
    } catch (error) {
        console.error("Error creando la oferta WebRTC:", error);
        statusDiv.textContent = 'Error al iniciar WebRTC.';
    }
}

async function handleWebRTCAnswer(payload) {
    if (peerConnection && payload.sdp) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            console.log('[DBG][PHONE][SDP][ANSWER] RemoteDescription aplicada. Contiene m=video?', /m=video/.test(peerConnection.remoteDescription.sdp));
        } catch (error) {
            console.error("Error al establecer la descripción remota:", error);
        }
    }
}

async function handleNewICECandidate(payload) {
    if (peerConnection && payload.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
            console.log('[DBG][PHONE][ICE] Candidato remoto añadido');
        } catch (error) {
            console.error("Error al añadir el candidato ICE:", error);
        }
    }
}

// --- NUEVAS FUNCIONES DE RECUPERACIÓN ---
function initSessionId() {
    try {
        const stored = localStorage.getItem('phoneSessionId');
        if (stored && stored.length <= 64) {
            sessionId = stored;
        } else {
            sessionId = crypto.randomUUID();
            localStorage.setItem('phoneSessionId', sessionId);
        }
        console.log('[SESSION][PHONE] sessionId=', sessionId);
    } catch (e) {
        console.warn('[SESSION][PHONE] No se pudo inicializar sessionId, modo ephemeral', e);
        sessionId = null;
    }
}

async function createAndSendOffer(options = {}) {
    const now = Date.now();
    lastOfferAt = now;
    const offer = await peerConnection.createOffer(options);
    await peerConnection.setLocalDescription(offer);
    console.log('[DBG][PHONE][SDP][OFFER] Enviando oferta. iceRestart=', !!options.iceRestart);
    socket.emit('webrtc-offer', { sdp: peerConnection.localDescription });
}

function scheduleConnectionHealthCheck() {
    setTimeout(() => {
        if (!peerConnection) return;
        const state = peerConnection.connectionState;
        if (state !== 'connected') {
            console.log('[RECOVERY][PHONE] HealthCheck detecta estado', state);
            attemptRecovery('ICE_RESTART');
        }
    }, 1500);
}

function attemptRecovery(mode) {
    if (!peerConnection || !isStreaming) return;
    if (pendingRecovery) {
        console.log('[RECOVERY][PHONE] Recuperación ya en curso, se ignora');
        return;
    }
    const sinceLastOffer = Date.now() - lastOfferAt;
    if (sinceLastOffer < RECOVERY_COOLDOWN_MS) {
        console.log('[RECOVERY][PHONE] Cooldown activo, se difiere intento', mode);
        return;
    }
    pendingRecovery = true;
    updateStatus('Intentando recuperar conexión...', 'warn');

    if (mode === 'ICE_RESTART') {
        iceRestartCount++;
        doIceRestart().catch(err => {
            console.error('[RECOVERY][PHONE] Error en ICE restart, recreando PC', err);
            recreatePeerConnection();
        });
    } else {
        recreatePeerConnection();
    }
}

async function doIceRestart() {
    console.log('[RECOVERY][PHONE] ICE restart iniciado');
    try {
        await createAndSendOffer({ iceRestart: true });
    } catch (e) {
        throw e;
    }
    // Esperar a ver si se recupera
    setTimeout(() => {
        if (!peerConnection) return;
        if (peerConnection.connectionState !== 'connected') {
            console.log('[RECOVERY][PHONE] ICE restart no logró conexión, recreando PC');
            recreatePeerConnection();
        } else {
            pendingRecovery = false;
            updateStatus('Conexión recuperada', 'success');
        }
    }, ICE_RESTART_TIMEOUT_MS);
}

function recreatePeerConnection() {
    recreateCount++;
    console.log('[RECOVERY][PHONE] Recreando PeerConnection');
    try { peerConnection && peerConnection.close(); } catch {}
    startWebRTCCall(socket, localStream);
    pendingRecovery = false;
    updateStatus('PeerConnection recreada', 'info');
}

// --- Cambio de cámara ---
async function switchCamera() {
    try {
        if (!isStreaming) return;
        currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
        const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacing }, audio: true });
        const newVideoTrack = newStream.getVideoTracks()[0];
        const sender = peerConnection?.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && newVideoTrack) {
            await sender.replaceTrack(newVideoTrack);
            // Actualizar preview local
            const oldTracks = localStream.getTracks();
            oldTracks.forEach(t => t.stop());
            localStream = newStream;
            localVideo.srcObject = localStream;
            // Renegociar (oferta nueva)
            await createAndSendOffer();
        }
    } catch (e) {
        console.error('[PHONE] Error al cambiar cámara', e);
        updateStatus('No se pudo cambiar la cámara', 'error');
    }
}

function updateStatus(msg, level='info') {
    statusDiv.textContent = `[${level}] ${msg}`;
}

// 6. Punto de Entrada
main();

// 7. Consola embebida (debug en móvil)
(function initEmbeddedConsole(){
    const wrapper = document.getElementById('embeddedConsoleWrapper');
    if(!wrapper) return; // por seguridad
    const logContainer = document.getElementById('embeddedConsoleLog');
    const btnToggle = document.getElementById('toggleConsoleBtn');
    const btnClear = document.getElementById('clearConsoleBtn');

    const original = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console)
    };

    const push = (level, args) => {
        try {
            const div = document.createElement('div');
            div.className = `log-entry log-level-${level}`;
            const time = new Date().toISOString().split('T')[1].replace('Z','');
            const spanTime = `<span class="log-time">${time}</span>`;
            const text = args.map(a => {
                if (a instanceof Error) return a.stack || a.message;
                if (typeof a === 'object') {
                    try { return JSON.stringify(a); } catch { return '[Object]'; }
                }
                return String(a);
            }).join(' ');
            div.innerHTML = spanTime + text;
            logContainer.appendChild(div);
            // recortar si excede 500 entradas
            if (logContainer.children.length > 500) {
                logContainer.removeChild(logContainer.firstChild);
            }
            logContainer.scrollTop = logContainer.scrollHeight;
        } catch(e){
            original.error('EmbeddedConsole push error', e);
        }
    };

    console.log = (...args) => { push('info', args); original.log(...args); };
    console.warn = (...args) => { push('warn', args); original.warn(...args); };
    console.error = (...args) => { push('error', args); original.error(...args); };
    console.debug = (...args) => { push('debug', args); original.debug(...args); };

    window.addEventListener('error', (ev) => {
        push('error', ['[GlobalError]', ev.message, ev.filename+':'+ev.lineno+':'+ev.colno]);
    });
    window.addEventListener('unhandledrejection', (ev) => {
        push('error', ['[UnhandledPromiseRejection]', ev.reason]);
    });

    btnToggle.addEventListener('click', () => {
        const collapsed = wrapper.classList.toggle('collapsed');
        btnToggle.textContent = collapsed ? 'Mostrar' : 'Ocultar';
    });
    btnClear.addEventListener('click', () => {
        logContainer.innerHTML='';
    });

    // Mostrar automáticamente primeros logs si hay error inicial
    setTimeout(()=>{
        if(logContainer.querySelector('.log-level-error')) {
            wrapper.classList.remove('collapsed');
            btnToggle.textContent = 'Ocultar';
        }
    },2000);
})();
