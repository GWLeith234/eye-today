// Pure decision for what a screened comment should become. No server-only import: the tests load it.
// The database makes the same decision again in apply_comment_screen, so this can only ask for less.

export const TRUSTED_AFTER = 3;

export type ScreenFlag = { kind: string; reason: string };

export type ScreenInput = {
  // null: the assistant is missing, failed or returned something unusable.
  flags: readonly ScreenFlag[] | null;
  publishedOthers: number;
  shadowBanned: boolean;
};

export type ScreenDecision = { status: "pending" | "published" | "shadow"; flags: ScreenFlag[] };

export function decideCommentStatus({ flags, publishedOthers, shadowBanned }: ScreenInput): ScreenDecision {
  const kept = flags ? flags.map((f) => ({ kind: f.kind, reason: f.reason })) : [];
  if (shadowBanned) return { status: "shadow", flags: kept };
  if (flags === null || kept.length > 0) return { status: "pending", flags: kept };
  return { status: publishedOthers >= TRUSTED_AFTER ? "published" : "pending", flags: kept };
}
