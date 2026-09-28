"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getEditorContext } from "@/lib/auth/editor";
import { originFromHeaders } from "@/lib/auth/origin";
import { createAdminClient } from "@/lib/supabase/admin";

// Errors raised by the database, mapped to short codes for the page.
const RAISED: Record<string, string> = {
  "not authenticated": "not_signed_in",
  "not authorized": "not_authorized",
  "profile not found": "no_profile",
  "role not grantable": "not_grantable",
};

function back(query: Record<string, string>): never {
  redirect(`/admin/applications?${new URLSearchParams(query).toString()}`);
}

export async function approveApplication(formData: FormData) {
  // getUser() + editor/admin role, both on the user-scoped client.
  const ctx = await getEditorContext();
  if (!ctx) redirect("/admin");
  const { supabase, userId } = ctx;

  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) back({ error: "invalid" });

  const { data: application } = await supabase
    .from("contributor_applications")
    .select("id, name, email, status")
    .eq("id", id.data)
    .maybeSingle<{ id: string; name: string; email: string; status: string }>();
  if (!application) back({ error: "not_found" });
  if (application.status !== "pending") back({ error: "not_pending" });

  // The only service-role call here: send the invite. No role in user_metadata
  // (only the applicant's name, for the profile's display_name); the signup
  // trigger creates a reader profile.
  // (redirect() throws, so no back() inside this try.)
  let targetId: string | null = null;
  let existing = false;
  let inviteError: string | null = null;
  try {
    const origin = originFromHeaders(await headers());
    const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(application.email, {
      redirectTo: `${origin}/auth/callback?next=%2Fcontribute`,
      data: { full_name: application.name },
    });
    if (error?.code === "email_exists") existing = true;
    else if (error) inviteError = "invite_failed";
    targetId = data.user?.id ?? null;
  } catch {
    inviteError = "not_configured";
  }
  if (inviteError) back({ error: inviteError });

  if (existing) {
    const { data: found, error } = await supabase.rpc("profile_id_for_email", { lookup: application.email });
    if (error) back({ error: RAISED[error.message] ?? "grant_failed" });
    targetId = (found as string | null) ?? null;
    if (!targetId) back({ error: "no_profile" });
    const { data: target } = await supabase.from("profiles").select("role").eq("id", targetId).maybeSingle<{ role: string }>();
    if (target?.role !== "reader" && target?.role !== "contributor") back({ error: "not_grantable" });
  }
  if (!targetId) back({ error: "invite_failed" });

  // As the signed-in editor, so the database checks auth.uid().
  const { error: grantError } = await supabase.rpc("grant_contributor", { target: targetId });
  if (grantError) back({ error: RAISED[grantError.message] ?? "grant_failed" });

  const { data: updated, error: updateError } = await supabase
    .from("contributor_applications")
    .update({ status: "approved", reviewed_by: userId })
    .eq("id", application.id)
    .eq("status", "pending")
    .select("id");
  if (updateError || !updated?.length) back({ error: "update_failed" });

  back({ done: existing ? "approved_existing" : "approved" });
}

const rejectSchema = z.object({ id: z.uuid(), reason: z.string().trim().min(1).max(500) });

export async function rejectApplication(formData: FormData) {
  const ctx = await getEditorContext();
  if (!ctx) redirect("/admin");

  const parsed = rejectSchema.safeParse({ id: formData.get("id"), reason: formData.get("reason") ?? "" });
  if (!parsed.success) back({ error: "reason_required" });

  const { data, error } = await ctx.supabase
    .from("contributor_applications")
    .update({ status: "rejected", reject_reason: parsed.data.reason, reviewed_by: ctx.userId })
    .eq("id", parsed.data.id)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) back({ error: "update_failed" });

  back({ done: "rejected" });
}
