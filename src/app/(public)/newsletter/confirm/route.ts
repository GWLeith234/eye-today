import { buttonHtml, escapeHtml, htmlResponse, paragraph } from "@/lib/newsletter/page-html";
import { isTokenShape, sha256Hex, unsubscribeToken } from "@/lib/newsletter/tokens";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

const invalid = () =>
  htmlResponse(
    "This link didn't work",
    paragraph("It may have expired (links last 48 hours) or already been used. You can subscribe again from the newsletter page.") +
      `<p><a href="/newsletter">Back to the newsletter page</a></p>`,
    400,
  );

// GET only shows a button. Mail scanners and link previewers open links, so nothing changes here.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!isTokenShape(token)) return invalid();
  return htmlResponse(
    "Confirm your subscription",
    paragraph("Press the button to start receiving the newsletter.") +
      `<form method="post" action="/newsletter/confirm?t=${escapeHtml(encodeURIComponent(token))}">${buttonHtml("Confirm my subscription")}</form>`,
  );
}

export async function POST(request: Request) {
  let token = new URL(request.url).searchParams.get("t");
  if (!token) {
    try {
      token = String((await request.formData()).get("t") ?? "");
    } catch {
      token = null;
    }
  }
  const secret = process.env.NEWSLETTER_LINK_SECRET?.trim();
  if (!secret) return htmlResponse("Email is not configured", paragraph("Email is not configured."), 503);
  if (!isTokenShape(token)) return invalid();

  const hash = sha256Hex(token);
  const supabase = createAnonClient();
  if (!supabase) return invalid();
  const { data, error } = await supabase.rpc("confirm_newsletter", {
    token_hash: hash,
    unsubscribe_hash: unsubscribeToken(secret, hash).hash,
  });
  if (error) return htmlResponse("Something went wrong", paragraph("We couldn't confirm that just now. Please try the link again."), 500);
  if (data !== true) return invalid();

  return htmlResponse(
    "You're subscribed",
    paragraph("Thanks — your subscription is confirmed. Every email has an unsubscribe link.") + `<p><a href="/">Read Eye Today</a></p>`,
  );
}
