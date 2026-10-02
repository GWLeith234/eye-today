import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry/scrub";

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}

export async function onRequestError(...args: Parameters<typeof Sentry.captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureRequestError(...args);
}
