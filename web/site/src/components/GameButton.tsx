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
  const label =
    "inline-flex items-center justify-center gap-2.5 px-7 py-3 font-['Cinzel'] text-sm uppercase tracking-[0.2em] transition-colors duration-200";

  if (variant === "outline") {
    return (
      <button
        onClick={onClick}
        className={`reverse-radius-sm group inline-block bg-[#d6af36] p-px cursor-pointer ${className}`}
      >
        <span
          className={`reverse-radius-sm-inner ${label} bg-[#0a0a0f] text-[#d6af36] group-hover:bg-black/50`}
        >
          {children}
        </span>
      </button>
    );
  }

  const fillStyles =
    variant === "primary"
      ? "bg-[#d6af36] text-[#0a0a0f] hover:bg-[#b89520]"
      : "bg-[#1f8ac0] text-white hover:bg-[#1570a0]";

  return (
    <button
      onClick={onClick}
      className={`reverse-radius-sm inline-block ${label} ${fillStyles} cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
};
