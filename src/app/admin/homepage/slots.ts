// The curated homepage positions. Lead is position 0 only (enforced in SQL too).
export const SLOTS = [
  { slot: "lead", position: 0, field: "lead", label: "Lead story" },
  { slot: "secondary", position: 0, field: "secondary-0", label: "Secondary 1" },
  { slot: "secondary", position: 1, field: "secondary-1", label: "Secondary 2" },
  { slot: "secondary", position: 2, field: "secondary-2", label: "Secondary 3" },
  { slot: "secondary", position: 3, field: "secondary-3", label: "Secondary 4" },
] as const;
