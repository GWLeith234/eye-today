"use server";

import { createTaxonomy, renameTaxonomy } from "@/lib/taxonomy";

export async function create(formData: FormData) {
  await createTaxonomy("tags", formData);
}

export async function rename(formData: FormData) {
  await renameTaxonomy("tags", formData);
}
