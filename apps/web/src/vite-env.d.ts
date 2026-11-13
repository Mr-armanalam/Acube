/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL, e.g. http://localhost:5000 */
  readonly VITE_BACKEND_URL: string;
  /** Google OAuth client ID (from Google Cloud Console) */
  readonly VITE_CLIENT_ID: string;
  /** Client-side AES key for the OTP/location payloads (obfuscation only — the key ships in the bundle) */
  readonly VITE_ENCRYPTED_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
