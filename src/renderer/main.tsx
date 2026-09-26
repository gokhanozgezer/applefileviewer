import React from 'react';
import ReactDOM from 'react-dom/client';
import '@shared/preloadApi';
// Yazı tipleri yerel paketlerden (Google Fonts yok — çevrimdışı + gizlilik).
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/globals.css';
import { App } from './App';
import { applyPlatformAttribute } from './lib/platform';

// <html data-platform="win32|darwin|linux"> — CSS (başlık çubuğu yerleşimi vb.) ilk
// boyamadan önce platforma göre ayarlanır.
applyPlatformAttribute();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
