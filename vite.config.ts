import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(__dirname, 'src/renderer'),
  plugins: [
    react(),
    electron([
      {
        entry: path.join(__dirname, 'src/main/index.ts'),
        vite: {
          build: {
            outDir: path.join(__dirname, 'dist-electron/main'),
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      {
        entry: path.join(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: path.join(__dirname, 'dist-electron/preload'),
            rollupOptions: { external: ['electron'] },
          },
        },
      },
    ]),
    renderer(),
  ],
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
