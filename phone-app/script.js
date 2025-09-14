// B. Lógica del Archivo script.js

// 1. Variables Globales y Constantes
const SERVER_URL = "http://localhost:3001"; // Cambia a tu URL de Render cuando despliegues
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
            const { latitude: lat, longitude: lon, altitude: alt } = position.coords;
            const gpsData = { lat, lon, alt };
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
            socket.emit('webrtc-ice-candidate', { candidate: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('Estado de la conexión WebRTC:', peerConnection.connectionState);
        statusDiv.textContent = `Estado WebRTC: ${peerConnection.connectionState}`;
    };

    // Añadir el Stream Local a la conexión
    stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
    });

    try {
        // Crear y Enviar la Oferta
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
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
        } catch (error) {
            console.error("Error al establecer la descripción remota:", error);
        }
    }
}

async function handleNewICECandidate(payload) {
    if (peerConnection && payload.candidate) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (error) {
            console.error("Error al añadir el candidato ICE:", error);
        }
    }
}

// 6. Punto de Entrada
main();
