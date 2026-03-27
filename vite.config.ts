import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.SERVER_PORT || '8787';

  const viteApiBase = String(process.env.VITE_API_BASE ?? env.VITE_API_BASE ?? '').trim();
  if (process.env.NETLIFY === 'true' && !viteApiBase) {
    console.warn(
      '\n[vite] VITE_API_BASE is unset. scripts/netlify-prebuild.mjs should still run first; if it could not read VITE_API_BASE, set it for Production builds on Netlify and redeploy.\n'
    );
  }

  return {
    define: {
      // Same merge as above so preview / optional direct-to-Railway builds still work.
      'import.meta.env.VITE_API_BASE': JSON.stringify(viteApiBase),
    },
    plugins: [react()],
    server: {
      port: 2000,
      strictPort: true,
      host: true,
      proxy: {
        // Used when running `npm run dev:split` or `npm run dev:client` (Vite alone). `npm run dev` uses one port (PORT, default 2000).
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
  };
});
