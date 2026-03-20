"use client";

import React from "react";
import { motion } from "motion/react";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="bg-card border border-foreground/10 rounded-lg p-8 hover:border-primary/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(31,138,192,0.2)]"
    >
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="mb-3 text-secondary">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
};
