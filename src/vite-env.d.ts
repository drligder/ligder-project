/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin when the frontend is not served behind the same origin as `/api`. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
