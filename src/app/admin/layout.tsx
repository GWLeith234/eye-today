import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

const NAV = [
  { href: "/admin/articles", label: "Articles" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/homepage", label: "Homepage" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/newsletters", label: "Newsletters" },
  { href: "/admin/ads", label: "Ads" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/tags", label: "Tags" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { profile } = await requireArea("admin");

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav aria-label="Admin" className="flex gap-4 border-b p-4 md:w-48 md:flex-col md:border-b-0 md:border-r">
        <Link href="/admin" className="font-bold">
          Newsroom
        </Link>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="underline-offset-4 hover:underline">
            {item.label}
          </Link>
        ))}
        {profile?.role === "admin" ? (
          <Link href="/admin/users" className="underline-offset-4 hover:underline">
            Users
          </Link>
        ) : null}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
