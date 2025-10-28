"use client";

import React from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { PatchNoteMeta } from "@/features/patch-notes/types";

export const PatchNoteCard: React.FC<PatchNoteMeta> = ({
  slug,
  title,
  version,
  date,
  summary,
}) => {
  return (
    <Link href={`/patch-notes/${slug}`}>
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-gradient-to-r from-card to-muted border-l-4 border-secondary p-6 rounded-lg hover:border-primary transition-all duration-300 mb-6"
      >
        <div className="flex justify-between items-start mb-3">
          <span className="text-primary font-mono text-3xl font-semibold">
            {version}
          </span>
          <span className="text-muted-foreground text-lg">{date}</span>
        </div>
        <h4 className="text-3xl md:text-4xl font-['Cinzel'] text-secondary mb-4">
          {title}
        </h4>
        <p className="text-muted-foreground text-lg">{summary}</p>
      </motion.div>
    </Link>
  );
};
