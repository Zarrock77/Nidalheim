import { PatchNotesList } from "@/features/patch-notes/components/PatchNoteList";
import { getPatchNotes } from "@/features/patch-notes/lib/getPatchNotes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nidalheim — Patch Notes & Updates",
  description:
    "Stay up to date with Nidalheim’s latest updates and gameplay improvements. Explore all patch notes and new content versions.",
  keywords: [
    "Nidalheim Patch Notes",
    "Game Updates",
    "Changelog",
    "Version History",
    "Nidalheim News",
    "Unreal Engine 5",
    "AI NPC Updates",
  ],
  openGraph: {
    title: "Nidalheim — Patch Notes & Updates",
    description:
      "Browse all updates and version releases of Nidalheim, including AI behavior improvements, new areas, and gameplay polish.",
    url: "https://www.nidalheim.com/patch-notes",
    siteName: "Nidalheim",
    // images: [
    //   {
    //     url: "https://www.nidalheim.com/og-patchnotes.jpg",
    //     width: 1200,
    //     height: 630,
    //     alt: "Nidalheim Patch Notes Overview",
    //   },
    // ],
    locale: "en_US",
    type: "article",
  },
};

export default async function PatchNotes() {
  const patchNotes = await getPatchNotes();

  return (
    <section
      id="all-patches"
      className="bg-gradient-to-b from-background via-card to-background"
    >
      <div className="max-w-5xl mx-auto">
        <PatchNotesList title="All Patch Notes" patchNotes={patchNotes} />
      </div>
    </section>
  );
}
