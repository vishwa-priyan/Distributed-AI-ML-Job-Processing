import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:5000',
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
