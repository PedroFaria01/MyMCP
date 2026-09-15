import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Config separada da do Vite principal (que carrega os plugins do Electron,
// nada a ver com testar a camada de armazenamento em Node puro). O ambiente
// padrão é 'node' (é o que armazenamento.ts/mcp-server precisam); os testes
// de componente usam `// @vitest-environment jsdom` no topo do arquivo.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/shared/**/*.test.ts', 'mcp-server/**/*.test.ts', 'src/renderer/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
