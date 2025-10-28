"use client";

import { motion } from "motion/react";
import { PatchNoteCard } from "@/components/PatchNotesCard";

export default function PatchNotes() {
  const patchNotes = [
    {
      version: "v1.2.0",
      title: "New Realm: The Frozen Wastes",
      date: "Oct 20, 2025",
      slug: "test",
    },
    {
      version: "v1.1.5",
      title: "Combat Balance & Bug Fixes",
      date: "Oct 10, 2025",
      slug: "combat-balance-bug-fixes",
    },
    {
      version: "v1.1.0",
      title: "Legendary Weapons Update",
      date: "Sep 28, 2025",
      slug: "legendary-weapons-update",
    },
    {
      version: "v1.0.0",
      title: "Initial Release",
      date: "Sep 15, 2025",
      slug: "initial-release",
    },
    {
      version: "v0.9.0",
      title: "New Features",
      date: "Sep 15, 2025",
      slug: "new-features",
    },
  ];

  return (
    <section
      id="all-patches"
      className="py-24 px-6 bg-gradient-to-b from-background via-card to-background"
    >
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl text-center font-['Cinzel'] text-secondary mb-12">
            All Patch Notes
          </h2>

          <div className="space-y-6 mb-12">
            {patchNotes.map((note, index) => (
              <PatchNoteCard
                key={index}
                version={note.version}
                title={note.title}
                date={note.date}
                slug={note.slug}
                index={index}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
