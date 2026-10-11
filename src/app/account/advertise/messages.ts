import { AD_CHECKOUT_MESSAGES } from "@/lib/ads/checkout";
import { SLOT_SIZES, isAdSlotName } from "@/lib/ads/slots";

export const NOTICES: Record<string, string> = {
  campaign: "Campaign saved.",
  creative: "Creative uploaded. It will be reviewed by an editor once the campaign is paid for.",
  deleted: "Deleted.",
  paid: "Thank you. Your payment is being confirmed; an editor will review the creatives and the campaign goes live when approved.",
};

const ERRORS: Record<string, string> = {
  ...AD_CHECKOUT_MESSAGES,
  invalid: "Check the campaign fields: advertiser and campaign names up to 120 characters.",
  invalid_url: "The click URL must be a full https address.",
  limited: "Too many changes in a short time. Please wait a little and try again.",
  alt: "Describe the creative in a few words (up to 300 characters) so readers using screen readers know what it says.",
  file_missing: "Choose an image to upload.",
  file_too_large: "Creatives must be 1 MB or smaller.",
  file_type: "Creatives must be JPEG, PNG, WebP or GIF images.",
  locked: "This campaign is live or finished, so its creatives can’t change. Start a new campaign instead.",
  no_click_url: "Give the campaign a click URL first.",
};

export function errorMessage(params: Record<string, string | string[] | undefined>): string | null {
  const key = typeof params.error === "string" ? params.error : "";
  if (!key) return null;
  if (key === "file_size") {
    const slot = typeof params.slot === "string" && isAdSlotName(params.slot) ? params.slot : null;
    const size = slot ? SLOT_SIZES[slot] : null;
    return size ? `That image is not ${size.width} × ${size.height} pixels, the size of the ${size.label.toLowerCase()} unit.` : "That image is not the size of the unit.";
  }
  return ERRORS[key] ?? "Something went wrong. Please try again.";
}
