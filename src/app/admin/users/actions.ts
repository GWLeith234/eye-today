"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { APP_ROLES } from "@/lib/auth/access";
import { originFromHeaders } from "@/lib/auth/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.email().max(254),
  role: z.enum(APP_ROLES),
});

// Errors raised by public.set_user_role, mapped to stable codes for the page.
const ROLE_ERRORS: Record<string, string> = {
  "not authenticated": "role_not_authenticated",
  "not authorized": "role_not_authorized",
  "invalid arguments": "role_invalid",
  "cannot change own role": "role_self",
  "profile not found": "role_no_profile",
  "last admin": "role_last_admin",
};

function back(query: Record<string, string>) {
  return `/admin/users?${new URLSearchParams(query).toString()}`;
}

export async function inviteUser(formData: FormData) {
  // 1. Who is calling, on the user-scoped client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fadmin%2Fusers");

  // 2. Caller must be an admin, read through the same client (RLS applies).
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role: string }>();
  if (me?.role !== "admin") redirect("/admin");

  // 3. Validate input.
  const parsed = inviteSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: formData.get("role"),
  });
  if (!parsed.success) redirect(back({ error: "invalid" }));
  const { email, role } = parsed.data;

  // 4. The only service-role call: send the invite. No role in user_metadata;
  //    the signup trigger creates a reader profile.
  let invitedId: string | null = null;
  let inviteError: string | null = null;
  try {
    const origin = originFromHeaders(await headers());
    const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/callback?next=%2Faccount`,
    });
    if (error) inviteError = error.code === "email_exists" ? "exists" : "invite_failed";
    invitedId = data.user?.id ?? null;
  } catch {
    inviteError = "not_configured";
  }
  if (inviteError || !invitedId) redirect(back({ error: inviteError ?? "invite_failed" }));

  // 5. Set the role as the signed-in admin, so the database checks auth.uid().
  const { error: roleError } = await supabase.rpc("set_user_role", {
    target: invitedId,
    new_role: role,
  });
  if (roleError) {
    redirect(back({ invited: email, error: ROLE_ERRORS[roleError.message] ?? "role_failed" }));
  }

  redirect(back({ invited: email, role }));
}
