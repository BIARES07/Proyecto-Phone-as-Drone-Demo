import React, { useState, useEffect } from 'react';
import './ModelEditor.css';

const ModelEditor = ({ models, setModels }) => {
  const [selectedModelId, setSelectedModelId] = useState(null);

  const selectedModel = models.find(m => m.id === selectedModelId);

  useEffect(() => {
    // Si el modelo seleccionado se elimina, deseleccionarlo
    if (selectedModelId && !selectedModel) {
      setSelectedModelId(null);
    }
  }, [models, selectedModelId, selectedModel]);

  const handleParamChange = (param, value) => {
    if (!selectedModelId) return;
    const newValue = param === 'uri' || param === 'name' ? value : parseFloat(value);
    setModels(prevModels =>
      prevModels.map(m =>
        m.id === selectedModelId ? { ...m, [param]: newValue } : m
      )
    );
  };

  const addNewModel = () => {
    const newId = Date.now();
    const newModel = {
      id: newId,
      name: `Modelo ${newId}`,
      uri: '/new-model.glb',
      lon: -66.76,
      lat: 10.10,
      height: 0,
      heading: 0,
      pitch: 0,
      roll: 0,
    };
    setModels(prev => [...prev, newModel]);
    setSelectedModelId(newId);
  };

  const removeSelectedModel = () => {
    if (!selectedModelId) return;
    setModels(prev => prev.filter(m => m.id !== selectedModelId));
    setSelectedModelId(null);
  };

  const control = (name, type, min, max, step = 0.1) => {
    if (!selectedModel) return null;
    const value = selectedModel[name];

    return (
      <div className="editor-control" key={name}>
        <label>{name.charAt(0).toUpperCase() + name.slice(1)}</label>
        {type === 'range' ? (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => handleParamChange(name, e.target.value)}
          />
        ) : null}
        <input
          type={type === 'range' ? 'number' : 'text'}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleParamChange(name, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div className="model-editor">
      <h4>Editor de Modelos (DEV)</h4>
      
      <div className="editor-toolbar">
        <button onClick={addNewModel}>+ Añadir Modelo</button>
        <select 
          value={selectedModelId || ''} 
          onChange={(e) => setSelectedModelId(Number(e.target.value))}
          disabled={models.length === 0}
        >
          <option value="" disabled>-- Seleccionar Modelo --</option>
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button onClick={removeSelectedModel} disabled={!selectedModelId}>- Eliminar</button>
      </div>

      {selectedModel ? (
        <>
          <div className="editor-controls">
            {control('name', 'text')}
            {control('uri', 'text')}
            {control('lon', 'range', -180, 180, 0.0001)}
            {control('lat', 'range', -90, 90, 0.0001)}
            {control('height', 'range', 0, 50000, 1)}
            {control('heading', 'range', 0, 360, 1)}
            {control('pitch', 'range', -180, 180, 1)}
            {control('roll', 'range', -180, 180, 1)}
          </div>
          <div className="editor-output">
            <p>Código para este modelo:</p>
            <pre>{`
<Entity
  name="${selectedModel.name}"
  position={Cartesian3.fromDegrees(${selectedModel.lon}, ${selectedModel.lat}, ${selectedModel.height})}
  orientation={Transforms.headingPitchRollQuaternion(
    Cartesian3.fromDegrees(${selectedModel.lon}, ${selectedModel.lat}, ${selectedModel.height}),
    new HeadingPitchRoll(
      Cesium.Math.toRadians(${selectedModel.heading}),
      Cesium.Math.toRadians(${selectedModel.pitch}),
      Cesium.Math.toRadians(${selectedModel.roll})
    )
  )}
  model={{
    uri: '${selectedModel.uri}',
    minimumPixelSize: 128,
  }}
/>
            `}</pre>
          </div>
        </>
      ) : (
        <p className="editor-placeholder">Añade o selecciona un modelo para editar.</p>
      )}
    </div>
  );
};

export default ModelEditor;
