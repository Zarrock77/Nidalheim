"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open]);

  if (!user) return null;

  const initial = (user.username || "?").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="reverse-radius-sm group inline-block bg-[#d6af36] p-px cursor-pointer"
      >
        <span className="reverse-radius-sm-inner flex items-center gap-2 bg-[#0a0a0f] py-1 pl-1 pr-3 transition-colors duration-200 group-hover:bg-black">
          <span
            className="reverse-radius-sm-inner grid h-7 w-7 place-items-center bg-[#d6af36] font-['Cinzel'] text-sm text-[#0a0a0f]"
            style={{ "--rr": "5px" } as React.CSSProperties}
          >
            {initial}
          </span>
          <span className="hidden sm:inline text-sm font-['Cinzel'] uppercase tracking-[0.15em] text-[#d6af36]">
            {user.username}
          </span>
          <ChevronDown
            size={14}
            className={`text-[#d6af36]/70 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="reverse-radius-sm absolute right-0 mt-2 w-60 bg-[#d6af36] p-px shadow-[0_10px_40px_rgba(0,0,0,0.6)]"
          >
            <div className="reverse-radius-sm-inner overflow-hidden bg-[#121218]">
              <div className="border-b border-[#d6af36]/20 px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-[#d6af36]/80">
                  <User size={12} />
                  <span>{user.role}</span>
                </div>
                <div className="mt-1 truncate text-sm text-foreground">
                  {user.username}
                </div>
                {user.email && (
                  <div className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-[#1a1a24]"
              >
                <LogOut size={14} className="text-muted-foreground" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
