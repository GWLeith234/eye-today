import Link from "next/link";

// Editors and admins can open /contribute, but they write in the newsroom.
export function EditorsGoToAdmin() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 p-8">
      <h1 className="text-3xl font-bold">Contributor desk</h1>
      <p>
        This desk is for contributors. Editors and admins work in the{" "}
        <Link href="/admin" className="underline">
          newsroom admin
        </Link>
        .
      </p>
    </main>
  );
}
