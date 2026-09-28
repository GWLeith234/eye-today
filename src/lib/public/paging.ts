export const PAGE_SIZE = 20;
export const MAX_PAGE = 100;

// ?page= must be an integer 1..100; anything else is page 1.
export function parsePage(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,3}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}
