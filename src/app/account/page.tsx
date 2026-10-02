import Link from "next/link";

import { requireArea } from "@/lib/auth/session";

import { signOut, updateProfile, uploadAvatar } from "./actions";

const MESSAGES: Record<string, string> = {
  profile: "Profile saved.",
  avatar: "Avatar updated.",
};

const ERRORS: Record<string, string> = {
  invalid_profile: "Display name is required (up to 80 characters); bio is up to 500 characters.",
  save_failed: "We couldn't save your profile. Please try again.",
  avatar_missing: "Choose an image to upload.",
  avatar_too_large: "Avatars must be 2 MB or smaller.",
  avatar_type: "Avatars must be JPEG, PNG or WebP images.",
  avatar_failed: "We couldn't upload your avatar. Please try again.",
};

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const { user, profile } = await requireArea("account");
  const params = await searchParams;
  const saved = typeof params.saved === "string" ? MESSAGES[params.saved] : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Your account</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </header>

      {saved ? (
        <p role="status" className="rounded border border-green-600 p-3 text-sm">
          {saved}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-1">
        <p className="text-sm opacity-70">{user.email}</p>
        <p>
          Role: <span data-testid="role">{profile?.role ?? "reader"}</span>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Profile</h2>
        <form action={updateProfile} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input
              name="display_name"
              required
              maxLength={80}
              defaultValue={profile?.display_name ?? ""}
              className="rounded border px-3 py-2 text-base"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Bio
            <textarea
              name="bio"
              maxLength={500}
              rows={4}
              defaultValue={profile?.bio ?? ""}
              className="rounded border px-3 py-2 text-base"
            />
          </label>
          <button type="submit" className="self-start rounded bg-foreground px-4 py-2 text-background">
            Save profile
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Avatar</h2>
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, no image optimizer config yet
          <img src={profile.avatar_url} alt="" width={96} height={96} className="h-24 w-24 rounded-full object-cover" />
        ) : null}
        <form action={uploadAvatar} className="flex flex-col gap-3">
          <input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required />
          <p className="text-xs opacity-70">JPEG, PNG or WebP, up to 2 MB.</p>
          <button type="submit" className="self-start rounded border px-4 py-2">
            Upload avatar
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Newsletter</h2>
        <Link href="/account/newsletters" className="text-sm underline">Manage your newsletter subscriptions</Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Membership</h2>
        <Link href="/account/billing" className="text-sm underline">Billing and supporter membership</Link>
      </section>
    </main>
  );
}
