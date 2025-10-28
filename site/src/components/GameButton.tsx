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
      "bg-gradient-to-r from-[#1F8AC0] to-[#1570A0] border-[#1F8AC0] text-white hover:shadow-[0_0_20px_rgba(31,138,192,0.5)] hover:scale-105",
    secondary:
      "bg-gradient-to-r from-[#D6AF36] to-[#B89520] border-[#D6AF36] text-[#0A0A0F] hover:shadow-[0_0_20px_rgba(214,175,54,0.5)] hover:scale-105",
    outline:
      "bg-transparent border-[#EAEAEA] text-[#EAEAEA] hover:bg-[#EAEAEA]/10 hover:shadow-[0_0_20px_rgba(234,234,234,0.3)] hover:scale-105",
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
