import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// sem `test.globals: true` no vitest.config.ts, o cleanup automático do
// Testing Library não se registra sozinho (ele procura por um `afterEach`
// global) — sem isso, o DOM de um teste fica de pé pro próximo dentro do
// mesmo arquivo, e consultas tipo getByText passam a achar duplicado.
afterEach(() => {
  cleanup();
});
