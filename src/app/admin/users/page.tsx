import { APP_ROLES } from "@/lib/auth/access";
import { requireArea } from "@/lib/auth/session";

import { inviteUser } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Enter a valid email address and choose a role.",
  exists: "That email already has an account.",
  invite_failed: "We couldn't send the invite. Please try again.",
  not_configured: "Invites are not configured on this server.",
  role_not_authenticated: "Role not set: you are not signed in.",
  role_not_authorized: "Role not set: only admins can change roles.",
  role_invalid: "Role not set: the request was incomplete.",
  role_self: "Role not set: you can't change your own role.",
  role_no_profile: "Role not set: that user has no profile yet.",
  role_last_admin: "Role not set: the site must keep at least one admin.",
  role_failed: "The invite was sent, but the role could not be set.",
};

type Row = { id: string; display_name: string | null; role: string };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { supabase } = await requireArea("admin-users");
  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const invited = typeof params.invited === "string" ? params.invited : undefined;

  const { data: users } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .order("display_name", { ascending: true })
    .returns<Row[]>();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 p-8">
      <h1 className="text-3xl font-bold">Users</h1>

      {invited && !error ? (
        <p role="status" className="rounded border border-green-600 p-3 text-sm">
          Invite sent to {invited}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-red-600 p-3 text-sm">
          {invited ? `Invite sent to ${invited}. ` : null}
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Invite someone</h2>
        <form action={inviteUser} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input type="email" name="email" required className="rounded border px-3 py-2 text-base" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select name="role" defaultValue="contributor" className="rounded border px-3 py-2 text-base">
              {APP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">
            Send invite
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Everyone</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-1">Name</th>
              <th className="py-1">Role</th>
              <th className="py-1">ID</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((row) => (
              <tr key={row.id} className="border-t">
                <td className="py-1">{row.display_name ?? "—"}</td>
                <td className="py-1">{row.role}</td>
                <td className="py-1 font-mono text-xs opacity-70">{row.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
