import { getEdition } from "@/lib/editions/public";
import { SLUG_RE } from "@/lib/slug";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The PDF lives in a private bucket. Access is decided by edition_by_slug (published, and public or
// supporter-early for this session), then the object is streamed with the service role. Nothing here
// is cached: an early-access response must never be served to the next visitor.
export async function GET(_request: Request, { params }: RouteContext<"/editions/[slug]/pdf">) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return new Response("Not found", { status: 404 });
  const edition = await getEdition(slug);
  if (!edition || !edition.pdf_path) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
  const { data, error } = await admin.storage.from("editions").download(edition.pdf_path);
  if (error || !data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

  return new Response(data.stream(), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.size),
      "Content-Disposition": `inline; filename="eye-today-${edition.slug}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
