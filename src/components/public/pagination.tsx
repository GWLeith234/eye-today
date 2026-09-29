import Link from "next/link";

import { MAX_PAGE, PAGE_SIZE } from "@/lib/public/paging";

export function Pagination({ basePath, page, total }: { basePath: string; page: number; total: number }) {
  const pages = Math.min(MAX_PAGE, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  if (pages <= 1 && page <= 1) return null;
  const href = (p: number) => (p === 1 ? basePath : `${basePath}?page=${p}`);
  return (
    <nav aria-label="Pages" className="mt-8 flex items-center justify-between border-t border-rule pt-4 text-sm">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="underline">← Newer stories</Link> : <span />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next" className="underline">Older stories →</Link> : <span />}
    </nav>
  );
}
