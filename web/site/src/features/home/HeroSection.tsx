"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";

const LAYER_0: CSSProperties = { "--rr": "7px" } as CSSProperties;
const LAYER_1_GAP: CSSProperties = {
  "--rr": "8px",
  "--rr-off": "1px",
} as CSSProperties;
const LAYER_2_RING: CSSProperties = {
  "--rr": "10px",
  "--rr-off": "3px",
} as CSSProperties;
const LAYER_3_CORE: CSSProperties = {
  "--rr": "11px",
  "--rr-off": "4px",
} as CSSProperties;

export const HeroSection = () => {
  return (
    <section
      id="home"
      className="relative h-screen flex items-center justify-center overflow-hidden"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1605433887450-490fcd8c0c17?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFudGFzeSUyMGdhbWUlMjBsYW5kc2NhcGV8ZW58MXx8fHwxNzYxNTgzNDI1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F]/70 via-[#0A0A0F]/50 to-[#0A0A0F]" />

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="relative z-10 text-center px-6"
      >
        <h1 className="text-6xl md:text-8xl font-['Cinzel'] text-secondary mb-6 drop-shadow-[0_0_30px_rgba(214,175,54,0.6)]">
          NIDALHEIM
        </h1>
        <p className="font-['Cinzel'] tracking-[0.15em] text-xl md:text-2xl text-foreground/90 mb-12 max-w-3xl mx-auto">
          Enter the Forgotten Realms of Nidalheim
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {/* Download for Windows — filled gold with double border */}
          <button
            className="rr-mask group inline-block cursor-pointer bg-[#d6af36] p-px"
            style={LAYER_0}
          >
            <span className="rr-mask block bg-[#0a0a0f] p-[2px]" style={LAYER_1_GAP}>
              <span className="rr-mask block bg-[#d6af36] p-px" style={LAYER_2_RING}>
                <span
                  className="rr-mask inline-flex items-center justify-center gap-2.5 bg-[#d6af36] px-7 py-3 font-['Cinzel'] text-sm uppercase tracking-[0.2em] text-[#0a0a0f] transition-colors duration-200 group-hover:bg-[#b89520]"
                  style={LAYER_3_CORE}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4 fill-current"
                  >
                    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                  </svg>
                  <span>Download for Windows</span>
                </span>
              </span>
            </span>
          </button>

          {/* Read Patch Notes — outline with double border */}
          <button
            className="rr-mask group inline-block cursor-pointer bg-[#d6af36] p-px"
            style={LAYER_0}
          >
            <span className="rr-mask block bg-[#0a0a0f] p-[2px]" style={LAYER_1_GAP}>
              <span className="rr-mask block bg-[#d6af36] p-px" style={LAYER_2_RING}>
                <span
                  className="rr-mask inline-flex items-center justify-center bg-[#0a0a0f] px-7 py-3 font-['Cinzel'] text-sm uppercase tracking-[0.2em] text-[#d6af36] transition-colors duration-200 group-hover:bg-black/50"
                  style={LAYER_3_CORE}
                >
                  Read Patch Notes
                </span>
              </span>
            </span>
          </button>
        </div>
      </motion.div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-primary rounded-full flex justify-center">
          <div className="w-1 h-3 bg-primary rounded-full mt-2" />
        </div>
      </div>
    </section>
  );
};
