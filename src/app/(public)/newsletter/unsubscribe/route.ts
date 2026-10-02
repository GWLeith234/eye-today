import { buttonHtml, escapeHtml, htmlResponse, paragraph } from "@/lib/newsletter/page-html";
import { isTokenShape, sha256Hex } from "@/lib/newsletter/tokens";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

type Info = { list_name: string; email_hint: string; status: string };

async function lookup(token: string): Promise<Info | null | "error"> {
  const supabase = createAnonClient();
  if (!supabase) return "error";
  const { data, error } = await supabase.rpc("newsletter_unsubscribe_info", { token_hash: sha256Hex(token) });
  if (error) return "error";
  return ((data as Info[] | null) ?? [])[0] ?? null;
}

const invalid = () =>
  htmlResponse("This link didn't work", paragraph("We couldn't find that subscription. It may already be gone."), 404);

// GET shows whose list this is and a button. It never changes the subscription.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!isTokenShape(token)) return invalid();
  const info = await lookup(token);
  if (info === "error") return htmlResponse("Something went wrong", paragraph("Please try again in a moment."), 500);
  if (!info) return invalid();
  if (info.status === "unsubscribed") {
    return htmlResponse("You're unsubscribed", paragraph(`${info.email_hint} is not subscribed to the ${info.list_name}.`));
  }
  return htmlResponse(
    "Unsubscribe",
    paragraph(`Stop sending the ${info.list_name} to ${info.email_hint}?`) +
      `<form method="post" action="/newsletter/unsubscribe?t=${escapeHtml(encodeURIComponent(token))}">${buttonHtml("Unsubscribe")}</form>`,
  );
}

// POST unsubscribes, from the button above or from a mail client's List-Unsubscribe one-click.
// One valid token is enough; no login.
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t");
  if (!isTokenShape(token)) return invalid();
  const supabase = createAnonClient();
  if (!supabase) return htmlResponse("Something went wrong", paragraph("Please try again in a moment."), 500);

  const { data, error } = await supabase.rpc("unsubscribe_newsletter", { token_hash: sha256Hex(token) });
  if (error) return htmlResponse("Something went wrong", paragraph("We couldn't unsubscribe you just now. Please try again."), 500);
  if (data !== true) return invalid();
  return htmlResponse("You're unsubscribed", paragraph("You won't get any more of this newsletter."));
}
