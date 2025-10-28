"use client";

import { motion } from "motion/react";
import { PatchNoteCard } from "@/features/patch-notes/components/PatchNoteCard";
import { PatchNoteMeta } from "@/features/patch-notes/types";

interface PatchNotesListProps {
  title: string;
  patchNotes: PatchNoteMeta[];
  footer?: React.ReactNode;
}

export const PatchNotesList: React.FC<PatchNotesListProps> = ({
  title,
  patchNotes,
  footer,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      <h2 className="text-4xl md:text-5xl text-center font-['Cinzel'] text-secondary mb-12">
        {title}
      </h2>

      <div className="space-y-6 mb-12">
        {patchNotes.map((note, index) => (
          <PatchNoteCard key={index} {...note} />
        ))}
      </div>
      {footer}
    </motion.div>
  );
};
