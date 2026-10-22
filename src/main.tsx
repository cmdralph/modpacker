import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { library } from './state/library';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Opens the saved pack library (migrating older single-pack saves) before the first render.
library.init();

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary backup={library.backup}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
