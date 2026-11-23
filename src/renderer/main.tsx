import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AlertPopup } from './components/AlertPopup';
import { MascotWidget } from './components/MascotWidget';
import './styles/global.css';

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {mode === 'alert' ? (
      <AlertPopup />
    ) : mode === 'mascot' ? (
      <MascotWidget />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
