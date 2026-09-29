import Image from "../opengraph-image";

// Stable address for the share card, used by the article's JSON-LD. Next serves the
// file-based image under a hashed name (the (public) group adds a suffix), so this
// route renders the same image at /<section>/<slug>/opengraph-image.
export async function GET(_request: Request, { params }: RouteContext<"/[section]/[slug]/opengraph-image">) {
  return Image({ params });
}
