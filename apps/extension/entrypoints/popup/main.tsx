import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
// Pull in Tailwind for this surface. Without this import the popup renders
// completely unstyled (no utility classes resolve). Each entrypoint imports it.
import '../../assets/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
);
