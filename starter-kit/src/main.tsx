import React from 'react';
import { createRoot } from 'react-dom/client';
// Import the HDS base styles — includes tokens, theme, utilities
import '@hirobius/design-system/tokens.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(<App />);
