import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Sign In — Nidalheim",
  description: "Enter the realm of Nidalheim.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 pt-24 pb-16">
      <AuthForm mode="login" returnTo={returnTo} />
    </main>
  );
}
