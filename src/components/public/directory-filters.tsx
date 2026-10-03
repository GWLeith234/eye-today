import type { DirectoryFilters } from "@/lib/directory/query";
import { VERIFICATION_LEVELS, VERIFICATION_LABELS, type DirectoryCategory } from "@/lib/directory/types";

const field = "rounded border border-rule bg-paper px-3 py-2 text-base";

export function DirectoryFilters({
  filters,
  categories,
  services,
  action = "/directory",
}: {
  filters: DirectoryFilters;
  categories: DirectoryCategory[];
  services: string[];
  action?: string;
}) {
  return (
    <form role="search" method="get" action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2 lg:col-span-3">
        Search
        <input name="q" defaultValue={filters.q} maxLength={80} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Country code
        <input name="country" defaultValue={filters.country} maxLength={2} placeholder="MX" className={`${field} uppercase`} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="category" defaultValue={filters.category} className={field}>
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Service
        <input name="service" defaultValue={filters.service} maxLength={40} list="directory-services" className={field} />
        <datalist id="directory-services">
          {services.map((service) => (
            <option key={service} value={service} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Verification
        <select name="verification" defaultValue={filters.verification} className={field}>
          <option value="">Any level</option>
          {VERIFICATION_LEVELS.map((level) => (
            <option key={level} value={level}>{VERIFICATION_LABELS[level]}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button type="submit" className="rounded bg-ink px-4 py-2 text-paper">Search</button>
      </div>
    </form>
  );
}
