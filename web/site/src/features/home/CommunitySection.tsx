"use client";

import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";

export const CommunitySection = () => {
  return (
    <section
      id="community"
      className="py-24 px-6 bg-gradient-to-b from-background via-card to-background"
    >
      <div className="max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-['Cinzel'] text-secondary mb-6">
            Join the Community
          </h2>
          <p className="text-xl text-muted-foreground mb-12">
            Join our journey. Connect with fellow adventurers, share your
            experiences, and stay updated on the latest news.
          </p>

          <div className="flex flex-wrap justify-center gap-6">
            <motion.a
              href="https://discord.gg/yKyHQyANvm"
              whileHover={{ scale: 1.05 }}
              className="reverse-radius-sm group inline-block bg-[#1f8ac0] p-px transition-colors duration-300"
            >
              <span className="reverse-radius-sm-inner flex items-center gap-3 bg-card px-8 py-4 transition-colors duration-300 group-hover:bg-black/50">
                <MessageCircle size={28} className="text-primary" />
                <span>Discord</span>
              </span>
            </motion.a>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
