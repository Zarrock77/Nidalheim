"use client";

import React from "react";

interface GameButtonProps {
  variant?: "primary" | "secondary" | "outline";
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const GameButton: React.FC<GameButtonProps> = ({
  variant = "primary",
  children,
  onClick,
  className = "",
}) => {
  const baseStyles =
    "px-8 py-4 rounded-lg transition-all duration-300 cursor-pointer border-2";

  const variants = {
    primary:
      "bg-gradient-to-r from-primary to-accent border-primary text-white hover:shadow-[0_0_20px_rgba(31,138,192,0.5)] hover:scale-105",
    secondary:
      "bg-gradient-to-r from-secondary to-secondary-foreground border-secondary text-secondary-foreground hover:shadow-[0_0_20px_rgba(214,175,54,0.5)] hover:scale-105",
    outline:
      "bg-transparent border-foreground text-foreground hover:bg-foreground/10 hover:shadow-[0_0_20px_rgba(234,234,234,0.3)] hover:scale-105",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
