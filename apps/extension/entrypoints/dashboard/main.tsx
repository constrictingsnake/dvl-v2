import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// Same Tailwind import as the popup — every surface that wants styles imports it.
import '../../assets/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
