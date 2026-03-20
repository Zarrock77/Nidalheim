"use client";

import { motion } from "motion/react";
import { GameButton } from "@/components/GameButton";

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
        <p className="text-xl md:text-2xl text-foreground mb-12 max-w-3xl mx-auto">
          Enter the Forgotten Realms of Nidalheim
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <GameButton variant="primary">Play Demo</GameButton>
          <GameButton variant="outline">Read Patch Notes</GameButton>
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
