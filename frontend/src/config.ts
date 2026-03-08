/**
 * Runtime configuration for the application.
 *
 * In production, values are injected via /config.js (written to S3 by CDK).
 * In local development, you can either:
 *   - Edit public/config.js directly, or
 *   - Set VITE_* env vars in a .env.local file (takes precedence in dev)
 */

interface RuntimeConfig {
  apiUrl: string;
  eventsHttpDomain?: string;
  eventsApiKey?: string;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

function getConfig(): RuntimeConfig {
  const runtimeConfig = window.__RUNTIME_CONFIG__;

  const apiUrl =
    import.meta.env.VITE_API_URL ||
    runtimeConfig?.apiUrl ||
    "http://localhost:3000";

  const eventsHttpDomain =
    import.meta.env.VITE_EVENTS_HTTP_DOMAIN ||
    runtimeConfig?.eventsHttpDomain ||
    undefined;

  const eventsApiKey =
    import.meta.env.VITE_EVENTS_API_KEY ||
    runtimeConfig?.eventsApiKey ||
    undefined;

  return { apiUrl, eventsHttpDomain, eventsApiKey };
}

export const config = getConfig();
