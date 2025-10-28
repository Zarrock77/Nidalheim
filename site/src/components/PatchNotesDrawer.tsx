"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface PatchNote {
  version: string;
  title: string;
  date: string;
  slug: string;
}

interface PatchNotesDrawerProps {
  patchNotes: PatchNote[];
}

export const PatchNotesDrawer: React.FC<PatchNotesDrawerProps> = ({
  patchNotes,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Fermer le drawer quand on change de page
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Bouton pour ouvrir le drawer */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed left-0 top-1/2 -translate-y-1/2 bg-secondary text-secondary-foreground p-3 rounded-r-lg shadow-lg hover:bg-secondary/90 transition-all duration-300 z-40 group"
        aria-label="Open patch notes"
      >
        <FileText size={24} />
        <span className="absolute left-full ml-2 px-2 py-1 bg-card text-foreground text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Patch Notes
        </span>
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: -400 }}
            animate={{ x: 0 }}
            exit={{ x: -400 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed left-0 top-0 h-full w-full sm:w-96 bg-card border-r border-border shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-card to-muted">
                <h2 className="text-2xl font-['Cinzel'] text-secondary">
                  Patch Notes
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-foreground hover:text-primary transition-colors p-2"
                  aria-label="Close drawer"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {patchNotes.map((note, index) => (
                  <Link
                    key={note.slug}
                    href={`/patch-notes/${note.slug}`}
                    onClick={() => setIsOpen(false)}
                  >
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      className={`p-4 rounded-lg border-l-4 transition-all duration-300 cursor-pointer ${
                        pathname === `/patch-notes/${note.slug}`
                          ? "border-primary bg-gradient-to-r from-primary/20 to-transparent"
                          : "border-secondary bg-gradient-to-r from-card to-muted hover:border-primary hover:from-primary/10"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-primary font-mono text-sm font-semibold">
                          {note.version}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {note.date}
                        </span>
                      </div>
                      <h3 className="text-foreground text-sm font-medium">
                        {note.title}
                      </h3>
                    </motion.div>
                  </Link>
                ))}

                {patchNotes.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    <FileText size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No patch notes available</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-border bg-gradient-to-r from-muted to-card">
                <Link href="/patch-notes" onClick={() => setIsOpen(false)}>
                  <button className="w-full bg-secondary text-secondary-foreground py-3 rounded-lg font-['Cinzel'] hover:bg-secondary/90 transition-all duration-300">
                    View All Patch Notes
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
