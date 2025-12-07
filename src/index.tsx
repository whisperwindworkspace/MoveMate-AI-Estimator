import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

// Render without StrictMode so dev behaves more like production and
// components/effects aren't double-invoked (which was causing stutter
// with the camera + overlays).
root.render(<App />);
