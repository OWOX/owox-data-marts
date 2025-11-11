/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_API_URL: string;
  readonly VITE_MOCK_INSIGHTS: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
