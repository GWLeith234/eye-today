import { safeNextPath } from "@/lib/auth/access";

import { sendMagicLink, signInWithGoogle } from "./actions";

const ERRORS: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  send_failed: "We couldn't send the sign-in link. Please try again in a minute.",
  google_unavailable: "Google sign-in isn't available right now. Use the email link instead.",
  auth: "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const sent = params.sent === "1";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Sign in to Eye Today</h1>

      {sent ? (
        <p role="status" className="rounded border border-green-600 p-3 text-sm">
          Check your email for a sign-in link.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <form action={sendMagicLink} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="rounded border px-3 py-2 text-base"
          />
        </label>
        <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">
          Email me a sign-in link
        </button>
      </form>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="w-full rounded border px-4 py-2">
          Continue with Google
        </button>
      </form>
    </main>
  );
}
