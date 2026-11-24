/// <reference types="vite/client" />
import type { KkachiAPI } from '../shared/types';

declare global {
  interface Window {
    kkachi: KkachiAPI;
  }
}

export {};
