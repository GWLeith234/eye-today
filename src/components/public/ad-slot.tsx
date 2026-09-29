// Placeholder only: no ad tables are read yet.
const HEIGHTS: Record<AdSlotName, string> = {
  leaderboard: "min-h-[90px]",
  "bigbox-1": "min-h-[250px]",
  "bigbox-2": "min-h-[250px]",
  "in-river": "min-h-[120px]",
};

export type AdSlotName = "leaderboard" | "bigbox-1" | "bigbox-2" | "in-river";

export function AdSlot({ name }: { name: AdSlotName }) {
  return (
    <aside
      aria-label="Advertisement"
      data-ad-slot={name}
      className={`flex w-full items-center justify-center border border-dashed border-rule bg-white/40 text-xs uppercase tracking-widest text-muted ${HEIGHTS[name]}`}
    >
      Advertisement
    </aside>
  );
}
