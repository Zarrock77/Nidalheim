"use client";

import React from "react";
import { motion } from "motion/react";
import Link from "next/link";

interface PatchNoteCardProps {
  version: string;
  title: string;
  date: string;
  index: number;
  slug: string;
}

export const PatchNoteCard: React.FC<PatchNoteCardProps> = ({
  version,
  title,
  date,
  index,
  slug,
}) => {
  return (
    <Link href={`/patch-notes/${slug}`}>
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        className="bg-gradient-to-r from-card to-muted border-l-4 border-secondary p-6 rounded-lg hover:border-primary transition-all duration-300 mb-6"
      >
        <div className="flex justify-between items-start mb-3">
          <span className="text-primary font-mono">{version}</span>
          <span className="text-muted-foreground text-sm">{date}</span>
        </div>
        <h4 className="text-foreground">{title}</h4>
      </motion.div>
    </Link>
  );
};
