/**
 * Runtime configuration for the application.
 *
 * Priority order:
 *   1. Runtime config from /config.js (injected by CDK in production)
 *   2. VITE_* env vars from .env.local (useful for local development)
 *   3. Hardcoded defaults
 *
 * This ensures deployed config.js values always win over build-time env vars,
 * so .env.local values won't leak into production builds.
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
    runtimeConfig?.apiUrl ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:3000";

  const eventsHttpDomain =
    runtimeConfig?.eventsHttpDomain ||
    import.meta.env.VITE_EVENTS_HTTP_DOMAIN ||
    undefined;

  const eventsApiKey =
    runtimeConfig?.eventsApiKey ||
    import.meta.env.VITE_EVENTS_API_KEY ||
    undefined;

  return { apiUrl, eventsHttpDomain, eventsApiKey };
}

export const config = getConfig();
