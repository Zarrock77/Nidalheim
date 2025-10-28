"use client";

import { useEffect, useState } from "react";
import { Brain, Globe, MessageCircle, Sword } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { GameButton } from "@/components/GameButton";
import { ImageWithFallback } from "@/components/ImageWithFallback";
import { FeatureCard } from "@/components/FeatureCard";
import { PatchNoteCard } from "@/components/PatchNotesCard";

export default function Home() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const features = [
    {
      icon: <Sword size={48} />,
      title: "Intense Combat",
      description:
        "Master a dynamic combat system with dozens of weapons, abilities, and tactical options to vanquish your foes.",
    },
    {
      icon: <Brain size={48} />,
      title: "Advanced AI",
      description:
        "Face intelligent enemies that adapt to your playstyle, learn from your tactics, and challenge you at every turn.",
    },
    {
      icon: <Globe size={48} />,
      title: "Vast Exploration",
      description:
        "Discover a rich, handcrafted world filled with secrets, ancient lore, and breathtaking landscapes waiting to be explored.",
    },
  ];

  const patchNotes = [
    {
      version: "v1.2.0",
      title: "New Realm: The Frozen Wastes",
      date: "Oct 20, 2025",
      slug: "new-realm-the-frozen-wastes",
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
  ];

  return (
    <>
      <section
        id="home"
        className="relative h-screen flex items-center justify-center overflow-hidden"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1605433887450-490fcd8c0c17?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZmFudGFzeSUyMGdhbWUlMjBsYW5kc2NhcGV8ZW58MXx8fHwxNzYxNTgzNDI1fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral)",
            transform: `translateY(${scrollY * 0.5}px)`,
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

      <section id="about" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl text-center font-['Cinzel'] text-secondary mb-12">
              About the Game
            </h2>
            <p className="text-lg text-center text-muted-foreground max-w-3xl mx-auto mb-16 leading-relaxed">
              Nidalheim is an epic dark fantasy action RPG that plunges you into
              a world where ancient gods have fallen and their corrupted power
              threatens to consume all of existence. Embark on a perilous
              journey through haunted forests, crumbling kingdoms, and forgotten
              realms to uncover the truth behind the cataclysm and forge your
              own destiny.
            </p>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {features.map((feature, index) => (
                <FeatureCard
                  key={index}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                />
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-lg overflow-hidden shadow-[0_0_50px_rgba(31,138,192,0.3)]"
            >
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1626880700245-0fe6ffa47742?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWRpZXZhbCUyMGNhc3RsZSUyMHJ1aW5zfGVufDF8fHx8MTc2MTU4MzQyNXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                alt="Nidalheim Gameplay"
                className="w-full h-[400px] object-cover"
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section
        id="patches"
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
              Latest Updates
            </h2>

            <div className="space-y-6 mb-12">
              {patchNotes.map((note, index) => (
                <PatchNoteCard
                  key={index}
                  version={note.version}
                  title={note.title}
                  date={note.date}
                  index={index}
                  slug={note.slug}
                />
              ))}
            </div>

            <div className="text-center">
              <Link href="/patch-notes">
                <GameButton variant="secondary">
                  View All Patch Notes
                </GameButton>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Community */}
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
                href="#"
                whileHover={{ scale: 1.1 }}
                className="flex items-center gap-3 bg-card border border-primary/30 rounded-lg px-8 py-4 hover:border-primary hover:shadow-[0_0_20px_rgba(31,138,192,0.4)] transition-all duration-300"
              >
                <MessageCircle size={28} className="text-primary" />
                <span>Discord</span>
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
