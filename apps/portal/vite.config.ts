import { URL, fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * O portal é o vestíbulo da suíte: três portas, nada mais.
 *
 * O proxy de `/api/orbis` existe para o portão de senha continuar sendo UM só.
 * A credencial vive no servidor Hono (8787) e é ele quem confere; o portal
 * apenas desenha o formulário. Passando pelo proxy, o navegador enxerga tudo na
 * mesma origem — então não há CORS para configurar e o cookie `orbis_sessao`
 * viaja sozinho. É o mesmo arranjo que o app web já usa.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 4000,
    proxy: {
      // `/api` inteiro, e não só `/api/orbis`: o portal também desliga a suíte,
      // e essa rota fica atrás do portão de propósito.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
