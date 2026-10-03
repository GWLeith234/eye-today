import Link from "next/link";

import { MEDICAL_DISCLAIMER } from "@/lib/public/disclaimer";

export function DirectoryFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <nav aria-label="Directory" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/directory" className="font-semibold hover:underline">Directory</Link>
        <Link href="/directory/how-we-verify" className="hover:underline">How we verify</Link>
        <Link href="/directory/submit" className="hover:underline">Add a listing</Link>
      </nav>
      {children}
      <p role="note" className="border-l-4 border-accent bg-white/60 p-3 text-sm font-semibold">
        {MEDICAL_DISCLAIMER}{" "}
        <Link href="/disclaimer" className="underline">Read the disclaimer</Link>
      </p>
    </div>
  );
}
