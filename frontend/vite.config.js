import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// W dev Vite proxuje /api i /socket.io do backendu, dzięki czemu frontend używa
// ścieżek względnych – tak samo jak w produkcji za nginx / load balancerem.
const BACKEND_URL = process.env.VITE_DEV_BACKEND_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
      '/socket.io': { target: BACKEND_URL, changeOrigin: true, ws: true },
    },
  },
});
