/**
 * Runtime configuration for the application.
 *
 * In production, values are injected via /config.js (written to S3 by CDK).
 * In local development, you can either:
 *   - Edit public/config.js directly, or
 *   - Set VITE_API_URL in a .env.local file (takes precedence in dev)
 */

interface RuntimeConfig {
  apiUrl: string;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

function getConfig(): RuntimeConfig {
  const runtimeConfig = window.__RUNTIME_CONFIG__;

  // In dev mode, VITE_API_URL takes precedence if set
  const apiUrl =
    import.meta.env.VITE_API_URL ||
    runtimeConfig?.apiUrl ||
    "http://localhost:3000";

  return { apiUrl };
}

export const config = getConfig();
