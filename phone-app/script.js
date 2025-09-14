// B. Lógica del Archivo script.js

// 1. Variables Globales y Constantes
const SERVER_URL = "https://proyecto-phone-as-drone-demo.onrender.com"; // Cambia a tu URL de Render cuando despliegues
let socket;
let peerConnection;
let localStream;

// Referencias al DOM
const startButton = document.getElementById('startButton');
const localVideo = document.getElementById('localVideo');
const statusDiv = document.getElementById('status');

// 2. Función de Inicialización Principal main()
function main() {
    // Añade un event listener al startButton para el evento click
    startButton.addEventListener('click', startStreaming);
    
    // Llama a initializeSocketConnection()
    initializeSocketConnection();
}

// 3. Lógica de Socket.IO
function initializeSocketConnection() {
    socket = io(SERVER_URL);

    // Definir todos los listeners de Socket.IO aquí
    socket.on('connect', () => {
        statusDiv.textContent = 'Conectado al servidor. Listo para transmitir.';
        socket.emit('register-client', { role: 'PHONE' });
    });

    socket.on('disconnect', () => {
        statusDiv.textContent = 'Desconectado del servidor.';
    });

    socket.on('webrtc-answer', (payload) => {
        handleWebRTCAnswer(payload);
    });

    socket.on('webrtc-ice-candidate', (payload) => {
        handleNewICECandidate(payload);
    });
}

// 4. Lógica de Streaming y Hardware
async function startStreaming() {
    // Deshabilitar el startButton para evitar múltiples clics
    startButton.disabled = true;
    statusDiv.textContent = 'Solicitando permisos...';

    try {
        // Solicitar permisos para video y audio
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        statusDiv.textContent = 'Permisos concedidos. Iniciando transmisión...';

        // Activar GPS y WebRTC
        activateGPS(socket);
        startWebRTCCall(socket, localStream);

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
        console.log('Estado de la conexión WebRTC:', peerConnection.connectionState);
        statusDiv.textContent = `Estado WebRTC: ${peerConnection.connectionState}`;
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
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log('[DBG][PHONE][SDP][OFFER] Primeras 300 chars =>\n', offer.sdp.slice(0,300));
        console.log('[DBG][PHONE] Senders actuales:', peerConnection.getSenders().map(s => ({ kind: s.track && s.track.kind, id: s.track && s.track.id, readyState: s.track && s.track.readyState })));
        socket.emit('webrtc-offer', { sdp: peerConnection.localDescription });
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
