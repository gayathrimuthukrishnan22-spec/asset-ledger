// ======================================================
// File Name : vite.config.ts
// Purpose   : Implements vite.config
// ======================================================

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';


// ======================================================
// START: vite.config Functions
// ======================================================

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});

// ======================================================
// END: vite.config Functions
// ======================================================

// ======================================================
// END OF FILE : vite.config.ts
// ======================================================
