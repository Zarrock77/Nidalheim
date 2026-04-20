import type { Metadata } from "next";
import { LinkClient } from "./LinkClient";

export const metadata: Metadata = {
  title: "Connect Device — Nidalheim",
  description: "Authorize Nidalheim Game to access your account.",
};

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 pt-24 pb-16">
      <LinkClient initialCode={(code ?? "").toString()} />
    </main>
  );
}
