import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from './AppShell';
import './globals.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <AppShell />
    </StrictMode>,
  );
}
