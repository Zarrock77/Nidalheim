import { Metadata } from "next";
import { HeroSection } from "@/features/home/HeroSection";
import { AboutSection } from "@/features/home/AboutSection";
import { PatchSection } from "@/features/home/PatchSection";
import { CommunitySection } from "@/features/home/CommunitySection";

export const metadata: Metadata = {
  title: "Nidalheim — Dark Fantasy RPG with AI-Powered NPCs",
  description:
    "Enter the mythic world of Nidalheim, a dark fantasy RPG where your choices shape intelligent AI NPCs and the fate of gods and mortals.",
  keywords: [
    "Nidalheim",
    "RPG",
    "Action RPG",
    "Dark Fantasy",
    "AI NPC",
    "Unreal Engine 5",
    "Tech4 Project",
    "Interactive Storytelling",
  ],
  openGraph: {
    title: "Nidalheim — AI-Driven Dark Fantasy RPG",
    description:
      "Discover Nidalheim, an immersive RPG with advanced AI NPCs that remember your choices and evolve with you.",
    url: "https://www.nidalheim.com",
    siteName: "Nidalheim",
    // images: [
    //   {
    //     url: "https://www.nidalheim.com/og-cover.jpg",
    //     width: 1200,
    //     height: 630,
    //     alt: "Nidalheim — Dark Fantasy RPG",
    //   },
    // ],
    locale: "en_US",
    type: "website",
  },
  alternates: {
    canonical: "https://www.nidalheim.com",
  },
  metadataBase: new URL("https://www.nidalheim.com"),
  other: {
    discord: "https://discord.gg/yKyHQyANvm",
  },
};

export default async function HomePage() {
  return (
    <>
      <HeroSection />
      <AboutSection />
      <PatchSection />
      <CommunitySection />
    </>
  );
}
