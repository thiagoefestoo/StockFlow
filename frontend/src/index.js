import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import { registerNumberInputWheelGuard } from './utils/numberInputWheelGuard';

registerNumberInputWheelGuard();

createRoot(document.getElementById('root')).render(<App />);


registerServiceWorker();
