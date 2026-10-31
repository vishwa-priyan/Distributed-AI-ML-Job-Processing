import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true
      },
      '/socket.io': {
        target: backendTarget,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err: any) => {
            if (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
              return;
            }
            console.error('[vite socket proxy error]:', err);
          });
        }
      }
    }
  }
});
