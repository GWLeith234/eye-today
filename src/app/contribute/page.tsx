import { requireArea } from "@/lib/auth/session";

export default async function ContributePage() {
  await requireArea("contribute");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">Contributor desk</h1>
      <p>The contributor desk isn&apos;t built yet. Drafting tools arrive in a later sprint.</p>
    </main>
  );
}
