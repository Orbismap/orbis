/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVE_BASE?: string;
  readonly VITE_DATA_BASE?: string;
  readonly VITE_OSM_BASE?: string;
  readonly VITE_WETTER_BASE?: string;
  readonly VITE_ASSETS_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
