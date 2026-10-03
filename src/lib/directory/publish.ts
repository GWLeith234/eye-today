import { UNREVIEWED_SUBMISSION_NOTE } from "./types";

// Publishing at verified or medically supervised still carrying the auto-note
// would mark a submission as checked when nobody has written what they checked.
export function publishVerificationError(status: string, level: string, note: string): string | null {
  if (status !== "published") return null;
  if (level !== "verified" && level !== "medically_supervised") return null;
  if (note.trim() !== UNREVIEWED_SUBMISSION_NOTE) return null;
  return "Write what you checked before publishing at this level.";
}
