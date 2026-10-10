import "server-only";

import { revalidatePath } from "next/cache";

import { BOARD, type PostingKind } from "./types";

// Everything that can show a posting: the cover's latest jobs, both boards, its page, a linked listing's
// rail and the sitemap. Without a slug (the webhook, the cron) the boards and the cover are enough; detail
// pages revalidate on their own within a minute.
export function refreshPostings(posting?: { kind: PostingKind; slug: string; listingSlug?: string | null }) {
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/classifieds");
  revalidatePath("/sitemap.xml");
  if (posting) {
    revalidatePath(`${BOARD[posting.kind].path}/${posting.slug}`);
    if (posting.listingSlug) revalidatePath(`/directory/listing/${posting.listingSlug}`);
  }
}
