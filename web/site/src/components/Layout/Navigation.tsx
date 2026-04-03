"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/lib/auth/AuthContext";
import { UserMenu } from "@/components/auth/UserMenu";

const navLinks = [
  { name: "Home", href: "/#home" },
  { name: "About", href: "/#about" },
  { name: "Patch Notes", href: "/#patches" },
  { name: "Community", href: "/#community" },
];

export const Navigation: React.FC = () => {
  const { user, isReady } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/85 backdrop-blur-md border-b border-white/5"
          : "bg-background/30 backdrop-blur-sm border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          <Link
            href="/"
            className="text-2xl font-['Cinzel'] tracking-[0.18em] text-[#d6af36]"
          >
            NIDALHEIM
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm text-foreground/70 transition-colors duration-200 hover:text-foreground"
              >
                {link.name}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            {isReady && user ? (
              <UserMenu />
            ) : (
              <>
                <Link
                  href="/login"
                  className="reverse-radius-sm group inline-block bg-[#d6af36] p-px"
                >
                  <span className="reverse-radius-sm-inner block bg-[#0a0a0f] px-5 py-2 font-['Cinzel'] text-[12px] uppercase tracking-[0.2em] text-[#d6af36] transition-colors duration-200 group-hover:bg-black/50">
                    Sign In
                  </span>
                </Link>
                <Link
                  href="/register"
                  className="reverse-radius-sm inline-block border border-[#d6af36] bg-[#d6af36] px-5 py-2 font-['Cinzel'] text-[12px] uppercase tracking-[0.2em] text-[#0a0a0f] transition-colors duration-200 hover:bg-[#b89520] hover:border-[#b89520]"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden text-foreground transition-colors hover:text-[#d6af36]"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="md:hidden mt-4 overflow-hidden"
            >
              <div className="flex flex-col gap-3 border-t border-white/5 pt-4 pb-2">
                {navLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-foreground/80 hover:text-foreground"
                    onClick={() => setIsOpen(false)}
                  >
                    {link.name}
                  </a>
                ))}
                <div className="mt-3 flex flex-col gap-2">
                  {isReady && user ? (
                    <UserMenu />
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setIsOpen(false)}
                        className="reverse-radius-sm group block w-full bg-[#d6af36] p-px"
                      >
                        <span className="reverse-radius-sm-inner block bg-[#0a0a0f] px-5 py-2.5 text-center font-['Cinzel'] text-[12px] uppercase tracking-[0.2em] text-[#d6af36] group-hover:bg-black/50">
                          Sign In
                        </span>
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setIsOpen(false)}
                        className="block w-full border border-[#d6af36] bg-[#d6af36] px-5 py-2.5 text-center font-['Cinzel'] text-[12px] uppercase tracking-[0.2em] text-[#0a0a0f] hover:bg-[#b89520] hover:border-[#b89520]"
                      >
                        Sign Up
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};
