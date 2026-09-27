import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

export default async function AdminPage() {
  const { profile } = await requireArea("admin");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p>Editorial tools arrive in a later sprint.</p>
      {profile?.role === "admin" ? (
        <Link href="/admin/users" className="underline">
          Manage users
        </Link>
      ) : null}
    </main>
  );
}
