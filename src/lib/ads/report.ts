// The slot × page-type breakdown of a campaign, shared by the admin and the advertiser's account.

export type BreakdownRow = { slot_key: string; page_type: string; impressions: number; clicks: number };

export function breakdownTotals(rows: BreakdownRow[]) {
  return rows.reduce((t, r) => ({ impressions: t.impressions + Number(r.impressions), clicks: t.clicks + Number(r.clicks) }), { impressions: 0, clicks: 0 });
}

// Click-through rate as a percentage string, or "–" with no impressions.
export function ctr(impressions: number, clicks: number): string {
  return impressions > 0 ? `${((clicks / impressions) * 100).toFixed(2)}%` : "–";
}

export function breakdownCsv(rows: BreakdownRow[]): string {
  const lines = ["slot,page_type,impressions,clicks,ctr"];
  for (const r of rows) lines.push([r.slot_key, r.page_type, String(r.impressions), String(r.clicks), ctr(Number(r.impressions), Number(r.clicks))].join(","));
  return `${lines.join("\n")}\n`;
}
