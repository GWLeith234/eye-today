// True only for a build that was started with E2E_FULL=1. next.config inlines
// process.env.E2E_FULL, so a Railway build (the flag unset) cannot turn this on
// later by setting the variable at runtime.
export function e2eSessionAllowed(env: Record<string, string | undefined>): boolean {
  return env.E2E_FULL === "1";
}
