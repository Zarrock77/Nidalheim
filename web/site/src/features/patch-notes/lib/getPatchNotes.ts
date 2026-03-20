import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { PatchNoteMeta } from "@/features/patch-notes/types";

const patchNotesDir = path.join(process.cwd(), "content", "patch-notes");

export async function getPatchNotes(limit?: number): Promise<PatchNoteMeta[]> {
  if (!fs.existsSync(patchNotesDir)) {
    return [];
  }

  const files = fs
    .readdirSync(patchNotesDir)
    .filter((f) => f.endsWith(".mdx"))
    .sort();

  const patchNotes: PatchNoteMeta[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(patchNotesDir, file), "utf-8");
    const { data: meta } = matter(raw);
    patchNotes.push({
      slug: file.replace(".mdx", ""),
      title: meta.title,
      version: `v${meta.version}`,
      date: meta.date,
      summary: meta.summary,
    });
  }

  if (limit) {
    return patchNotes.slice(0, limit);
  }

  return patchNotes;
}
