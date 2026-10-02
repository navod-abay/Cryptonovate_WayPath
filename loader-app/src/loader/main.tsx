import React from 'react';
import { createRoot } from 'react-dom/client';
import LoaderApp from './LoaderApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <LoaderApp />
    </React.StrictMode>
  );
}
