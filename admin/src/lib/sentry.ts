import * as Sentry from "@sentry/react";

export function initSentry() {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: import.meta.env.MODE,
    });
  }
}

export { Sentry };
