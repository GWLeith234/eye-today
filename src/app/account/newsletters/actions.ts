"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireArea } from "@/lib/auth/session";

export async function unsubscribeFromList(formData: FormData) {
  const { supabase } = await requireArea("account");
  const id = z.uuid().safeParse(String(formData.get("subscriber_id") ?? ""));
  if (!id.success) redirect("/account/newsletters?error=1");

  const { data, error } = await supabase.rpc("unsubscribe_my_newsletter", { subscriber: id.data });
  redirect(error || data !== true ? "/account/newsletters?error=1" : "/account/newsletters?unsubscribed=1");
}
