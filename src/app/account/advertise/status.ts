export type CampaignRow = {
  id: string;
  advertiser_name: string;
  name: string;
  status: string;
  months: number | null;
  starts_at: string | null;
  ends_at: string | null;
  paid_at: string | null;
  reject_reason: string | null;
  click_url: string | null;
};

export const STATUS: Record<string, string> = {
  draft: "Draft (not paid)",
  pending: "Paid · waiting for an editor",
  active: "Live",
  paused: "Paused by an editor",
  ended: "Ended",
  rejected: "Not approved",
};
