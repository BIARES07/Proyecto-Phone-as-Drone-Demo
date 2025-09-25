import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './components/GpsDisplay.css'; // Importar el CSS del nuevo componente
// Cesium widgets CSS (muestra la barra superior, buscador y controles)
import 'cesium/Build/Cesium/Widgets/widgets.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
