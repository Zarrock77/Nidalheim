"use server";

import { createClient } from "@/lib/supabase/server";
import matter from "gray-matter";
import { PatchNoteMeta } from "@/features/patch-notes/types";

export async function getPatchNotes(limit?: number): Promise<PatchNoteMeta[]> {
  const supabase = await createClient();
  const { data: files } = await supabase.storage.from("patch-notes").list("", {
    sortBy: {
      column: "name",
      order: "asc",
    },
    search: "v",
    limit: limit,
  });
  const patchNotes: PatchNoteMeta[] = [];
  for (const file of files || []) {
    if (!file.name.endsWith(".mdx")) continue;
    const { data } = await supabase.storage
      .from("patch-notes")
      .download(file.name);
    if (!data) continue;
    const text = await data.text();
    const { data: meta } = matter(text);
    patchNotes.push({
      slug: file.name.replace(".mdx", ""),
      title: meta.title,
      version: `v${meta.version}`,
      date: meta.date,
      summary: meta.summary,
    });
  }
  return patchNotes;
}
