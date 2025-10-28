"use client";

import { ImageWithFallback } from "@/components/ImageWithFallback";
import { Brain, Globe, Sword } from "lucide-react";
import { motion } from "motion/react";
import { FeatureCard } from "@/components/FeatureCard";

export const AboutSection = () => {
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
  return (
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
            Nidalheim is an epic dark fantasy action RPG that plunges you into a
            world where ancient gods have fallen and their corrupted power
            threatens to consume all of existence. Embark on a perilous journey
            through haunted forests, crumbling kingdoms, and forgotten realms to
            uncover the truth behind the cataclysm and forge your own destiny.
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
  );
};
