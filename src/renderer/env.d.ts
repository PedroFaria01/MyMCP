/// <reference types="vite/client" />

import type { ApiHub } from '../shared/tipos';

declare global {
  interface Window {
    hub: ApiHub;
  }
}

export {};
