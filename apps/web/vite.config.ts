import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), basicSsl()],
  // esbuild >=0.28 errors when lowering some destructuring patterns (styled-components, @base-ui/react,
  // lucide-react, ...) for the Safari 14 target workaround. The target browsers all support destructuring
  // natively, so tell esbuild not to transform it. This must be set in BOTH passes: `esbuild` covers source
  // transform + the production build target, while `optimizeDeps.esbuildOptions` covers the dev-server
  // dependency pre-bundling. Pinned via the root `esbuild` override (GHSA-gv7w-rqvm-qjhr).
  esbuild: {
    supported: {
      destructuring: true,
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      supported: {
        destructuring: true,
      },
    },
  },
  build: {
    minify: mode === 'production',
    sourcemap: mode === 'development',
  },
  test: {
    environment: 'happy-dom',
    setupFiles: [],
  },
  server: {
    host: '0.0.0.0',
    hmr: {
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}));
