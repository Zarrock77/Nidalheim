import fs from "fs";
import path from "path";

export interface PatchNoteFrontmatter {
  title: string;
  version: string;
  date: string;
  summary: string;
}

export interface PatchNoteData {
  frontmatter: PatchNoteFrontmatter;
  content: string;
}

const patchNotesDir = path.join(process.cwd(), "content", "patch-notes");

export async function getPatchNoteBySlug(
  slug: string
): Promise<PatchNoteData | null> {
  const filePath = path.join(patchNotesDir, `${slug}.mdx`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const text = fs.readFileSync(filePath, "utf-8");

  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = text.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {
        title: "",
        version: "",
        date: "",
        summary: "",
      },
      content: text,
    };
  }

  const frontmatterText = match[1];
  const content = match[2];

  const frontmatter: PatchNoteFrontmatter = {
    title: "",
    version: "",
    date: "",
    summary: "",
  };

  frontmatterText.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split(":");
    if (key && valueParts.length > 0) {
      const value = valueParts
        .join(":")
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key.trim() === "title") frontmatter.title = value;
      if (key.trim() === "version") frontmatter.version = `v${value}`;
      if (key.trim() === "date") frontmatter.date = value;
      if (key.trim() === "summary") frontmatter.summary = value;
    }
  });

  return {
    frontmatter,
    content,
  };
}
